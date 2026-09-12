from flask import Flask, request, render_template, jsonify, redirect, url_for, session
from copy import deepcopy
from uuid import uuid4
import json
from main import generate_schedules, diagnose_no_schedule, option_meetings
from datetime import datetime
import random
import os
import re
import time
from flask_cors import CORS



app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or os.urandom(32)
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_CONTENT_LENGTH", 5 * 1024 * 1024))
app.config["CHROME_WEB_STORE_URL"] = os.environ.get("CHROME_WEB_STORE_URL", "")

CORS(app, resources={r"/api/workday/*": {"origins": "*"}})

# ===========================================
# SCHOOL CONFIGURATION
# ===========================================
# Define all supported schools here
# id: used internally and for filenames (e.g., "washu" -> "washu-all_courses.json")
# name: display name shown to users
# abbr: optional abbreviation shown below name

SCHOOLS = [
    {"id": "washu", "name": "Washington University"},
    #{"id": "uiuc", "name": "UIUC"},
    #{"id": "mit", "name": "MIT (beta)"},
]

def load_courses_for_school(school_id):
    """Load courses JSON for a given school."""
    if school_id not in {school["id"] for school in SCHOOLS}:
        return None

    filepath = f"static/jsonfiles/{school_id}-all_courses.json"
    try:
        with open(filepath, 'r') as file:
            return json.load(file)
    except FileNotFoundError:
        return None


def get_session_id():
    if "session_id" not in session:
        session["session_id"] = uuid4().hex
    return session["session_id"]


def cleanup_cache(cache):
    now = time.time()
    expired = [
        key for key, value in cache.items()
        if now - value.get("created", 0) > CACHE_TTL_SECONDS
    ]
    for key in expired:
        cache.pop(key, None)


def cache_set(cache, session_key, payload):
    cleanup_cache(cache)
    cache_id = uuid4().hex
    cache[cache_id] = {
        "owner": get_session_id(),
        "created": time.time(),
        "payload": payload,
    }
    session[session_key] = cache_id
    return cache_id


def cache_set_public(cache, payload):
    cleanup_cache(cache)
    cache_id = uuid4().hex
    cache[cache_id] = {
        "owner": None,
        "created": time.time(),
        "payload": payload,
    }
    return cache_id


def cache_get(cache, session_key):
    cleanup_cache(cache)
    cache_id = session.get(session_key)
    if not cache_id:
        return None

    cached = cache.get(cache_id)
    if not cached or cached.get("owner") != get_session_id():
        return None

    return cached.get("payload")


def cache_get_by_id(cache, cache_id):
    cleanup_cache(cache)
    cached = cache.get(cache_id)
    if not cached:
        return None
    return cached.get("payload")


def normalize_share_code(code):
    code = (code or "").strip().upper()
    return code if SHARE_CODE_RE.match(code) else None

SCHEDULE_CACHE = {}
MATCH_CACHE = {}
NO_SCHEDULE_CACHE = {}
CACHE_TTL_SECONDS = 60 * 60
SHARE_CODE_RE = re.compile(r"^BP[A-Z2-9]{6}$")
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{3,8}$")
RENDER_TIME_RE = re.compile(r"^\d{2}:\d{2}$")
MAX_RENDERABLE_SCHEDULES = 500
MAX_COURSES_PER_RENDERED_SCHEDULE = 80
MAX_RENDER_TEXT_LENGTH = 240
MAX_WORKDAY_COURSES = 20
MAX_WORKDAY_SECTION_OPTIONS = 300


def coerce_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize_day_code(value):
    if not value:
        return None

    raw = str(value).strip()
    if len(raw) == 7 and all(char in "MTWRFSU-" for char in raw.upper()):
        return raw.upper()

    lowered = raw.lower()
    chars = list("-------")

    token_map = {
        "monday": ("M", 0), "mon": ("M", 0), "mo": ("M", 0),
        "tuesday": ("T", 1), "tue": ("T", 1), "tues": ("T", 1), "tu": ("T", 1),
        "wednesday": ("W", 2), "wed": ("W", 2), "we": ("W", 2),
        "thursday": ("R", 3), "thu": ("R", 3), "thur": ("R", 3), "thurs": ("R", 3), "th": ("R", 3),
        "friday": ("F", 4), "fri": ("F", 4), "fr": ("F", 4),
        "saturday": ("S", 5), "sat": ("S", 5), "sa": ("S", 5),
        "sunday": ("U", 6), "sun": ("U", 6), "su": ("U", 6),
    }

    for token, (label, idx) in token_map.items():
        if re.search(rf"\b{re.escape(token)}\b", lowered):
            chars[idx] = label

    compact = re.sub(r"[^A-Za-z]", "", raw)
    if compact and chars == list("-------"):
        i = 0
        while i < len(compact):
            two = compact[i:i + 2].lower()
            one = compact[i].upper()
            if two in ("tu", "th"):
                if two == "tu":
                    chars[1] = "T"
                else:
                    chars[3] = "R"
                i += 2
                continue
            if one == "M":
                chars[0] = "M"
            elif one == "T":
                chars[1] = "T"
            elif one == "W":
                chars[2] = "W"
            elif one == "R":
                chars[3] = "R"
            elif one == "F":
                chars[4] = "F"
            elif one == "S":
                chars[5] = "S"
            elif one == "U":
                chars[6] = "U"
            i += 1

    result = "".join(chars)
    return result if result != "-------" else None


def normalize_time_value(value):
    if not value:
        return None

    raw = str(value).strip().upper().replace(".", "")
    raw = re.sub(r"(?<=\d)\s*(AM|PM)\b", r" \1", raw)
    raw = re.sub(r"\s+", " ", raw)

    formats = ("%H:%M", "%I:%M %p", "%I %p")
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).strftime("%H:%M")
        except ValueError:
            continue

    return None


def normalize_workday_academic_period(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    named = re.search(
        r"\b(Fall|Spring|Summer|Winter)(?:\s+(?:Half [AB]|Intersession))?\s+(20\d{2})\b",
        text,
        re.IGNORECASE,
    )
    if named:
        return f"{named.group(1).title()} {named.group(2)}"

    year_first = re.search(
        r"\b(20\d{2})(?:\s*-\s*20\d{2})?\s+(Fall|Spring|Summer|Winter)\b",
        text,
        re.IGNORECASE,
    )
    if year_first:
        return f"{year_first.group(2).title()} {year_first.group(1)}"
    return ""


def normalize_workday_courses(raw_courses):
    grouped = {}

    def add_meeting(course_code, course_name, section, days, start_time, end_time,
                    building, professor, academic_period=None, status=None):
        course_code = (course_code or "").strip()
        course_name = (course_name or course_code or "Workday Course").strip()
        days = normalize_day_code(days)
        start_time = normalize_time_value(start_time)
        end_time = normalize_time_value(end_time)
        academic_period = normalize_workday_academic_period(academic_period)

        if str(status or "").strip().lower() in {"closed", "cancelled", "canceled"}:
            return
        if not course_code or not days or not start_time or not end_time or start_time >= end_time:
            return

        key = course_code.upper()
        if key not in grouped:
            grouped[key] = {
                "CourseCode": course_code,
                "CourseName": course_name,
                "options": {},
            }

        course = grouped[key]
        subsection = str(section or len(course["options"]) + 1).strip()
        option = course["options"].setdefault(subsection, {
            "meetings": [],
            "academic_period": academic_period,
        })
        if not option["academic_period"] and academic_period:
            option["academic_period"] = academic_period
        elif academic_period and option["academic_period"] != academic_period:
            return
        dedupe_key = (days, start_time, end_time)
        if any(
            (meeting["days"], meeting["times"][0], meeting["times"][1]) == dedupe_key
            for meeting in option["meetings"]
        ):
            return

        option["meetings"].append({
            "days": days,
            "times": [start_time, end_time],
            "building": str(building or "").strip(),
            "professor": str(professor or "TBA").strip(),
        })

    def add_meeting_values(course_code, course_name, subsection, days_value,
                           times_value, building_value, professor_value,
                           academic_period=None, status=None):
        if (
            isinstance(times_value, (list, tuple))
            and len(times_value) >= 2
            and not isinstance(times_value[0], (list, tuple))
        ):
            time_ranges = [times_value]
        elif isinstance(times_value, (list, tuple)):
            time_ranges = list(times_value)
        else:
            time_ranges = []

        day_values = list(days_value) if isinstance(days_value, (list, tuple)) else [days_value]
        building_values = list(building_value) if isinstance(building_value, (list, tuple)) else [building_value]
        professor_values = list(professor_value) if isinstance(professor_value, (list, tuple)) else [professor_value]

        for meeting_index, time_range in enumerate(time_ranges):
            if not isinstance(time_range, (list, tuple)) or len(time_range) < 2:
                continue
            add_meeting(
                course_code,
                course_name,
                subsection,
                day_values[meeting_index] if meeting_index < len(day_values) else day_values[-1] if day_values else None,
                time_range[0],
                time_range[1],
                building_values[meeting_index] if meeting_index < len(building_values) else building_values[-1] if building_values else "",
                professor_values[meeting_index] if meeting_index < len(professor_values) else professor_values[-1] if professor_values else "TBA",
                academic_period,
                status,
            )

    for item in raw_courses or []:
        if not isinstance(item, dict):
            continue

        if {"CourseCode", "CourseName", "subsection", "Days", "Times"}.issubset(item.keys()):
            for idx, subsection in enumerate(item.get("subsection", [])):
                times = item.get("Times", [])
                time_value = times[idx] if idx < len(times) else None
                academic_periods = item.get("AcademicPeriod", [])
                academic_period = (
                    academic_periods[idx]
                    if isinstance(academic_periods, (list, tuple)) and idx < len(academic_periods)
                    else academic_periods if isinstance(academic_periods, str) else ""
                )
                add_meeting_values(
                    item.get("CourseCode"),
                    item.get("CourseName"),
                    subsection,
                    item.get("Days", [None])[idx] if idx < len(item.get("Days", [])) else None,
                    time_value,
                    item.get("Building", [""])[idx] if idx < len(item.get("Building", [])) else "",
                    item.get("Prof", ["TBA"])[idx] if idx < len(item.get("Prof", [])) else "TBA",
                    academic_period,
                )
            continue

        sections = item.get("sections") or [item]
        for section in sections:
            if not isinstance(section, dict):
                continue

            meetings = section.get("meetings") or [section]
            for meeting in meetings:
                if not isinstance(meeting, dict):
                    continue
                add_meeting(
                    item.get("courseCode") or item.get("code") or section.get("courseCode") or section.get("code"),
                    item.get("courseName") or item.get("name") or section.get("courseName") or section.get("name"),
                    section.get("section") or section.get("subsection") or meeting.get("section"),
                    meeting.get("days") or meeting.get("dayPattern") or section.get("days") or section.get("dayPattern"),
                    meeting.get("startTime") or meeting.get("start") or section.get("startTime") or section.get("start"),
                    meeting.get("endTime") or meeting.get("end") or section.get("endTime") or section.get("end"),
                    meeting.get("building") or meeting.get("location") or section.get("building") or section.get("location"),
                    meeting.get("instructor") or meeting.get("professor") or meeting.get("prof")
                    or section.get("instructor") or section.get("professor") or section.get("prof"),
                    meeting.get("academicPeriod") or section.get("academicPeriod") or item.get("academicPeriod"),
                    meeting.get("status") or section.get("status"),
                )

    normalized = []
    for course in grouped.values():
        result = {
            "CourseCode": course["CourseCode"],
            "CourseName": course["CourseName"],
            "subsection": [],
            "Days": [],
            "Times": [],
            "Building": [],
            "Prof": [],
            "AcademicPeriod": [],
        }
        for subsection, option in course["options"].items():
            meetings = option["meetings"]
            if not meetings:
                continue
            result["subsection"].append(subsection)
            result["AcademicPeriod"].append(option["academic_period"])
            if len(meetings) == 1:
                result["Days"].append(meetings[0]["days"])
                result["Times"].append(meetings[0]["times"])
                result["Building"].append(meetings[0]["building"])
                result["Prof"].append(meetings[0]["professor"])
            else:
                result["Days"].append([meeting["days"] for meeting in meetings])
                result["Times"].append([meeting["times"] for meeting in meetings])
                result["Building"].append([meeting["building"] for meeting in meetings])
                result["Prof"].append([meeting["professor"] for meeting in meetings])
        if result["subsection"]:
            normalized.append(result)

    return normalized


def clean_render_text(value, fallback="", limit=MAX_RENDER_TEXT_LENGTH):
    text = str(value if value is not None else fallback).strip()
    return text[:limit]


def clean_render_time(value):
    if not isinstance(value, str):
        return None

    text = value.strip()
    if not RENDER_TIME_RE.match(text):
        return None

    try:
        datetime.strptime(text, "%H:%M")
    except ValueError:
        return None

    return text


def sanitize_renderable_schedule(schedule):
    if not isinstance(schedule, dict):
        return None
    if not schedule or len(schedule) > MAX_COURSES_PER_RENDERED_SCHEDULE:
        return None

    cleaned = {}
    for course_name, info in schedule.items():
        if not isinstance(info, dict):
            return None

        title = clean_render_text(course_name, "Course", 180)
        days = clean_render_text(info.get("days"), limit=16).upper()
        times = info.get("times")

        if not title or len(days) < 6 or any(char not in "MTWRFSU-" for char in days[:7]):
            return None
        if not isinstance(times, list) or len(times) < 2:
            return None

        cleaned_times = [clean_render_time(time_value) for time_value in times]
        if any(time_value is None for time_value in cleaned_times):
            return None

        start_time = datetime.strptime(cleaned_times[0], "%H:%M")
        end_time = datetime.strptime(cleaned_times[-1], "%H:%M")
        if start_time > end_time:
            return None

        boxcolor = clean_render_text(info.get("boxcolor"), "#F0F0F0", 32)
        if not HEX_COLOR_RE.match(boxcolor):
            boxcolor = "#F0F0F0"

        cleaned[title] = {
            "displayName": clean_render_text(info.get("displayName"), title, 180),
            "days": days[:7].ljust(7, "-"),
            "times": cleaned_times,
            "prof": clean_render_text(info.get("prof"), "TBA"),
            "building": clean_render_text(info.get("building"), ""),
            "subsection": clean_render_text(info.get("subsection"), ""),
            "code": clean_render_text(info.get("code"), ""),
            "timestring": clean_render_text(info.get("timestring"), ""),
            "academicPeriod": clean_render_text(info.get("academicPeriod"), "", 40),
            "boxcolor": boxcolor,
        }
        if info.get("matched"):
            cleaned[title]["matched"] = True

    return cleaned


def sanitize_renderable_schedules(value):
    if isinstance(value, dict):
        schedules = [value]
    elif isinstance(value, list):
        schedules = value
    else:
        return None

    if not schedules or len(schedules) > MAX_RENDERABLE_SCHEDULES:
        return None

    cleaned = []
    for schedule in schedules:
        clean_schedule = sanitize_renderable_schedule(schedule)
        if clean_schedule is None:
            return None
        cleaned.append(clean_schedule)

    return cleaned


def build_renderable_schedules(courses, valid_schedules, want_distance=False):
    dataschool = []
    display_distances = {}
    tempdictcolors = {}
    pastel_colors = ["#FFEBEF", "#FFEADC", "#FFFFE5", "#E5FFEE", "#E5F4FF", "#FFEAF3", "#E5FFF8", "#EDE5FF"]
    multiple_sched = []

    for schedule in valid_schedules:
        data = {}
        for course_index, subsection_index in enumerate(schedule):
            c = courses[course_index]
            course_name = c['CourseName']
            course_identity = f"{c['CourseCode']}|{course_name}"
            color = tempdictcolors.get(course_identity)
            if not color:
                color = pastel_colors.pop(0) if pastel_colors else "#F0F0F0"
                tempdictcolors[course_identity] = color

            meetings = option_meetings(c['Days'][subsection_index], c['Times'][subsection_index])
            building_value = c['Building'][subsection_index]
            professor_value = c['Prof'][subsection_index]
            academic_periods = c.get('AcademicPeriod', [])
            academic_period = academic_periods[subsection_index] if subsection_index < len(academic_periods) else ""
            buildings = list(building_value) if isinstance(building_value, (list, tuple)) else [building_value]
            professors = list(professor_value) if isinstance(professor_value, (list, tuple)) else [professor_value]

            for meeting_index, meeting in enumerate(meetings):
                building = buildings[meeting_index] if meeting_index < len(buildings) else buildings[-1] if buildings else ""
                professor = professors[meeting_index] if meeting_index < len(professors) else professors[-1] if professors else "TBA"
                render_key = course_name
                if render_key in data:
                    render_key = f"{course_name} · meeting {meeting_index + 1}"
                while render_key in data:
                    render_key += " "

                value = {
                    "displayName": course_name,
                    "days": meeting['days'],
                    "times": round_down_time(meeting['times']),
                    "prof": professor.title() if professor else "TBA",
                    "building": building,
                    "subsection": c['subsection'][subsection_index],
                    "code": c['CourseCode'],
                    "timestring": convert_to_ampm(meeting['times']),
                    "academicPeriod": academic_period,
                    "boxcolor": color,
                }
                data[render_key] = value

        if want_distance:
            multiple_sched.append(getDays(list(data.values())))

        dataschool.append(data)

    display_distances = {index + 1: [[] for _ in range(6)] for index in range(len(dataschool))}
    if want_distance:
        with open("static/walkingdist.json", 'r', encoding="utf-8") as file:
            distance_data = json.load(file)
        for index, week in enumerate(multiple_sched):
            v = []
            for day, locs in week.items():
                if len(locs) <= 1:
                    v.append([])
                    continue
                dv = []
                for i in range(len(locs) - 1):
                    try:
                        s = f"{locs[i].split()[0]}-{locs[i + 1].split()[0]}"
                        if s not in distance_data:
                            s = f"{locs[i + 1].split()[0]}-{locs[i].split()[0]}"
                        d = distance_data.get(s, {})
                        dv.append(s + ": " + d.get("duration", "Unknown") + " | " + d.get("distance", "Unknown"))
                    except (AttributeError, IndexError, TypeError):
                        dv.append("Unknown")
                v.append(dv)
            display_distances[index + 1] = v

    return {
        "school": dataschool,
        "displayDistances": display_distances,
    }


# ===========================================
# ROUTES
# ===========================================

def extension_listing_url():
    """Only link installation to an explicitly configured Chrome Web Store item."""
    value = str(app.config.get("CHROME_WEB_STORE_URL", "")).strip()
    if re.fullmatch(r"https://chromewebstore\.google\.com/detail/(?:[a-z0-9-]+/)?[a-p]{32}", value):
        return value
    return None


@app.route('/')
def index():
    """Landing page with school selection."""
    return render_template('index.html', schools=SCHOOLS, extension_store_url=extension_listing_url())


@app.route('/extension')
def extension_setup():
    return render_template('extension.html', extension_store_url=extension_listing_url())


@app.route('/privacy')
def privacy():
    return render_template('privacy.html')

@app.route('/team')
def team():
    """Landing page with school selection."""
    return render_template('team.html')

@app.route('/timeline')
def timeline():
    """Public product timeline."""
    return render_template('timeline.html')

@app.route('/get_courses', methods=['POST'])
def get_courses():
    """
    Fetch courses for a selected school.
    Called when user selects a school and clicks Next.
    """
    data = request.get_json(silent=True) or {}
    school_id = data.get('school')

    if not school_id:
        return jsonify({"error": "No school selected"}), 400

    courses = load_courses_for_school(school_id)

    if courses is None:
        return jsonify({"error": f"Courses not found for school: {school_id}"}), 404

    # Store school in session for later use
    session['current_school'] = school_id

    # Return sorted list of course names
    course_list = sorted(list(courses.keys()))
    return jsonify({"courses": course_list})


@app.route('/get_professors', methods=['POST'])
def get_professors():
    """Get professors for selected courses."""
    data = request.get_json(silent=True) or {}
    selected_courses = data.get('items', [])

    school_id = session.get('current_school')
    if not school_id:
        return jsonify({"error": "No school selected"}), 400

    courses_data = load_courses_for_school(school_id)
    if not courses_data:
        return jsonify({"error": "Could not load courses"}), 500

    course_professors = {}
    for course_name in selected_courses:
        course_data = courses_data.get(course_name)
        if not course_data:
            continue
        # Filter out None professors before sorting
        professors = set(p for p in course_data['Prof'] if p is not None)
        course_professors[course_name] = sorted(professors)

    return jsonify(course_professors)


@app.route('/process_items', methods=['POST'])
def process_items():
    """Process selected courses and generate schedules."""
    datas = request.get_json(silent=True) or {}

    # Get school from request or session
    school_id = datas.get('school') or session.get('current_school')
    if not school_id:
        return jsonify({"error": "No school selected"}), 400

    # Store in session
    session['current_school'] = school_id

    # Load courses for this school
    coursesMain = load_courses_for_school(school_id)
    if not coursesMain:
        return jsonify({"error": "Could not load courses"}), 500

    try:
        maxnumber = int(datas.get('maxnumber', 10)) - 1
    except (TypeError, ValueError):
        maxnumber = 9

    noClassBefore = datas.get('noClassBefore') or "00:00"
    noClassAfter = datas.get('noClassAfter') or "23:59"
    timeStart = datas.get('timeStart', [])
    timeEnd = datas.get('timeEnd', [])
    wantDistance = datas.get('showDistance')

    if isinstance(timeStart, str): timeStart = [timeStart]
    if isinstance(timeEnd, str): timeEnd = [timeEnd]
    if maxnumber < 0: maxnumber = 10**6

    selected_courses = datas.get('items', [])
    preferred_profs = datas.get('preferredProfs', {}) or {}

    def is_prof_allowed(course_key, prof):
        if course_key not in preferred_profs:
            return True
        return prof in preferred_profs.get(course_key, [])

    courses = []
    for course_name in selected_courses:
        raw = coursesMain.get(course_name)
        if not raw:
            continue

        # Filter profs based on preference. Use the selected key because duplicate
        # course titles may be disambiguated in the JSON by appending the code.
        keep_indices = [i for i, prof in enumerate(raw["Prof"]) if is_prof_allowed(course_name, prof)]
        if not keep_indices:
            continue

        filtered_course = {
            "CourseCode": raw["CourseCode"],
            "CourseName": raw["CourseName"],
            "subsection": [raw["subsection"][i] for i in keep_indices],
            "Days": [raw["Days"][i] for i in keep_indices],
            "Times": [raw["Times"][i] for i in keep_indices],
            "Building": [raw["Building"][i] for i in keep_indices],
            "Prof": [raw["Prof"][i] for i in keep_indices]
        }

        if is_lab_combo(filtered_course["subsection"]):
            courses.extend(split_class_and_lab(filtered_course))
        else:
            courses.append(filtered_course)

    valid_schedules = generate_schedules(courses, maxnumber, noClassBefore, noClassAfter, timeStart, timeEnd)

    if not valid_schedules:
        suggestions = diagnose_no_schedule(courses, noClassBefore, noClassAfter, timeStart, timeEnd)
        cache_set(NO_SCHEDULE_CACHE, "no_schedule_result_id", {
            "suggestions": suggestions,
            "selected_courses": selected_courses,
            "filtered_courses": [course.get("CourseName") for course in courses],
        })
        return redirect(url_for('render_no_timetable'))

    cache_set(SCHEDULE_CACHE, "schedule_result_id", build_renderable_schedules(courses, valid_schedules, wantDistance))

    return redirect(url_for('render_timetable'))


@app.route('/api/workday/health')
def api_workday_health():
    return jsonify({"status": "ok", "apiVersion": 1})


@app.route('/api/workday/generate', methods=['POST'])
def api_workday_generate():
    """Generate schedules from courses collected by the Workday browser extension."""
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    courses = normalize_workday_courses(data.get("courses") or data.get("sections") or [])

    if not courses:
        return jsonify({
            "error": "No usable course sections found. Open a Workday page with visible meeting days and times, then scan again."
        }), 400

    section_option_count = sum(len(course.get("subsection", [])) for course in courses)
    if len(courses) > MAX_WORKDAY_COURSES or section_option_count > MAX_WORKDAY_SECTION_OPTIONS:
        return jsonify({
            "error": (
                f"Import at most {MAX_WORKDAY_COURSES} courses and "
                f"{MAX_WORKDAY_SECTION_OPTIONS} section options at once."
            )
        }), 400

    requested_results = max(1, min(coerce_int(data.get("maxnumber"), 50), 100))
    maxnumber = requested_results - 1

    no_class_before = data.get("noClassBefore") or "00:00"
    no_class_after = data.get("noClassAfter") or "23:59"
    time_start = data.get("timeStart") or []
    time_end = data.get("timeEnd") or []

    valid_schedules = generate_schedules(courses, maxnumber, no_class_before, no_class_after, time_start, time_end)

    if not valid_schedules:
        suggestions = diagnose_no_schedule(courses, no_class_before, no_class_after, time_start, time_end)
        result_id = cache_set_public(NO_SCHEDULE_CACHE, {
            "suggestions": suggestions,
            "selected_courses": [course.get("CourseName") for course in courses],
        })
        return jsonify({
            "status": "no_schedules",
            "resultId": result_id,
            "redirect": url_for("render_no_timetable", result_id=result_id),
            "suggestions": suggestions,
            "courseCount": len(courses),
        })

    result = build_renderable_schedules(courses, valid_schedules, data.get("showDistance", False))
    result_id = cache_set_public(SCHEDULE_CACHE, result)
    return jsonify({
        "status": "ok",
        "resultId": result_id,
        "redirect": url_for("render_timetable", result_id=result_id),
        "scheduleCount": len(result["school"]),
        "courseCount": len(courses),
    })


# ===========================================
# SHARED SCHEDULES
# ===========================================

@app.route('/save_shared_schedule', methods=['POST'])
def save_shared_schedule():
    os.makedirs('shared_schedules', exist_ok=True)

    data = request.get_json(silent=True) or {}
    schedules = sanitize_renderable_schedules(data.get("schedules", []))
    existing_code = data.get("code", None)

    if not schedules:
        return jsonify({"error": "No valid schedules provided"}), 400

    if existing_code:
        code = normalize_share_code(existing_code)
        if not code:
            return jsonify({"error": "Invalid share code"}), 400
    else:
        code = None
        for _ in range(20):
            candidate = "BP" + ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=6))
            if not os.path.exists(f"shared_schedules/{candidate}.json"):
                code = candidate
                break
        if not code:
            return jsonify({"error": "Could not generate share code"}), 500

    with open(f"shared_schedules/{code}.json", "w", encoding="utf-8") as f:
        json.dump(schedules, f)

    return jsonify({"code": code})


@app.route('/get_shared_schedule2/<code>')
def get_shared_schedule2(code):
    code = normalize_share_code(code)
    if not code:
        return jsonify({"error": "Invalid code"}), 400

    try:
        with open(f"shared_schedules/{code}.json", "r", encoding="utf-8") as f:
            schedule = sanitize_renderable_schedules(json.load(f))
        if not schedule:
            return jsonify({"error": "Saved schedule is invalid"}), 422
        return jsonify({"schedules": schedule})
    except FileNotFoundError:
        return jsonify({"error": "Code not found"}), 404


@app.route('/get_shared_schedule/<code>')
def get_shared_schedule(code):
    code = normalize_share_code(code)
    if not code:
        return jsonify({"error": "Invalid code"}), 400

    try:
        with open(f"shared_schedules/{code}.json", "r", encoding="utf-8") as f:
            schedules = json.load(f)
        schedules = [s[0] if isinstance(s, list) and len(s) == 1 else s for s in schedules]
        schedules = sanitize_renderable_schedules(schedules)
        if not schedules:
            return jsonify({"error": "Saved schedule is invalid"}), 422
        response = jsonify({"schedules": schedules})
        return response
    except FileNotFoundError:
        return jsonify({"error": "Code not found"}), 404


# ===========================================
# TIMETABLE RENDERING
# ===========================================

@app.route('/render_timetable')
@app.route('/render_timetable/<result_id>')
def render_timetable(result_id=None):
    result = cache_get_by_id(SCHEDULE_CACHE, result_id) if result_id else cache_get(SCHEDULE_CACHE, "schedule_result_id")
    if not result:
        return redirect(url_for('index'))

    return render_template(
        'timetable.html',
        school=result["school"],
        displayDistances=result["displayDistances"],
        matchedlist=False,
        friendMatchedSchedule=None,
        sharedList=False,
        savedList=False,
    )


@app.route('/render_no_timetable')
@app.route('/render_no_timetable/<result_id>')
def render_no_timetable(result_id=None):
    result = (
        cache_get_by_id(NO_SCHEDULE_CACHE, result_id)
        if result_id
        else cache_get(NO_SCHEDULE_CACHE, "no_schedule_result_id")
    ) or {}
    return render_template(
        'no_timetable.html',
        suggestions=result.get("suggestions", []),
        selected_courses=result.get("selected_courses", []),
    )

@app.route("/render_timetable_check")
def render_timetable_check():
    result = cache_get(MATCH_CACHE, "match_result_id")
    if not result:
        return redirect(url_for('index'))

    matched_schedule = sanitize_renderable_schedules(result.get("matchedSchedule"))
    if not matched_schedule:
        return redirect(url_for('index'))

    best = matched_schedule

    dummy_distances = {index + 1: [[] for _ in range(6)] for index in range(len(best))}
    source = result.get("source", "shared")

    return render_template(
        "timetable.html",
        school=best,
        displayDistances=dummy_distances,
        matchedlist=False,
        friendMatchedSchedule=result.get("friendMatchedSchedule", 0),
        sharedList=source == "shared",
        savedList=source == "saved",
    )


@app.route('/render_timetable2')
def render_timetable2():
    result = cache_get(MATCH_CACHE, "match_result_id")
    if not result:
        return redirect(url_for('index'))

    matched_schedule = sanitize_renderable_schedules(result.get("matchedSchedule"))
    if not matched_schedule:
        return redirect(url_for('index'))

    best = deepcopy(matched_schedule[0])
    overlapping_courses = set(result.get("overlappingCourses", []))

    for course_name, info in best.items():
        info['matched'] = course_name in overlapping_courses

    dummy_distances = {1: [[] for _ in range(6)]}

    return render_template(
        "timetable.html",
        school=[best],
        displayDistances=dummy_distances,
        matchedlist=True,
        friendMatchedSchedule=result.get("friendMatchedSchedule", 0),
        sharedList=False,
        savedList=False,
    )


@app.route('/set_matched_schedule', methods=['POST'])
def set_matched_schedule():
    data = request.get_json(silent=True) or {}
    matched_schedule = sanitize_renderable_schedules(data.get("matchedSchedule", []))
    if not matched_schedule:
        return jsonify({"error": "No valid schedule provided"}), 400

    source = data.get("source", "shared")
    if source not in {"shared", "saved"}:
        source = "shared"

    cache_set(MATCH_CACHE, "match_result_id", {
        "matchedSchedule": matched_schedule,
        "overlappingCourses": data.get("overlappingCourses", []),
        "friendMatchedSchedule": data.get("friendMatchedSchedule", 0),
        "source": source,
    })
    return jsonify({"status": "ok"})


# ===========================================
# HELPER FUNCTIONS
# ===========================================

def convert_to_datetime(time_str):
    return datetime.strptime(time_str, '%H:%M')


def getDays(classes):
    schedule = {day: [] for day in 'MTWRFS'}
    for cls in classes:
        days = cls['days']
        times = cls['times']
        building = cls['building']
        time_slots = [convert_to_datetime(t) for t in times]
        for i, day in enumerate(days):
            if day in schedule:
                start_time = time_slots[0]
                schedule[day].append({'start_time': start_time, 'building': building, 'timestring': cls['timestring']})

    for day in schedule:
        schedule[day].sort(key=lambda x: x['start_time'])

    daily_building_list = {day: [] for day in 'MTWRFS'}
    for day, classes in schedule.items():
        for cls in classes:
            daily_building_list[day].append(cls['building'])

    return daily_building_list


def convert_to_ampm(time_range):
    def convert_time(time_str):
        return datetime.strptime(time_str, '%H:%M').strftime('%I:%M %p')

    start_time = convert_time(time_range[0])
    end_time = convert_time(time_range[-1])
    return f"{start_time}-{end_time}".replace(" ", "")


def round_down_time(times):
    """Convert exact times into hourly slots for timetable grid display."""
    if not times or len(times) < 2:
        return ["08:00", "09:00"]  # safe fallback

    start_hour, start_minute = map(int, times[0].split(':'))
    end_hour, end_minute = map(int, times[-1].split(':'))
    end_slot = end_hour if end_minute else end_hour - 1

    # Cap to the template range.
    start_hour = max(7, start_hour)
    end_slot = min(22, max(start_hour, end_slot))

    full_hours = [f"{hour:02d}:00" for hour in range(start_hour, end_slot + 1)]
    return full_hours if full_hours else ["08:00", "09:00"]


def is_lab_combo(subsections):
    digits = [s for s in subsections if str(s or "").isdigit()]
    letters = [s for s in subsections if str(s or "").isalpha()]
    return len(digits) > 0 and len(letters) > 0


def split_class_and_lab(course):
    subsections = course['subsection']
    days = course['Days']
    times = course['Times']
    buildings = course['Building']
    profs = course['Prof']

    digits = [i for i, s in enumerate(subsections) if str(s or "").isdigit()]
    letters = [i for i, s in enumerate(subsections) if str(s or "").isalpha()]

    class_part = {
        "CourseCode": course["CourseCode"],
        "CourseName": course["CourseName"],
        "subsection": [subsections[i] for i in digits],
        "Days": [days[i] for i in digits],
        "Times": [times[i] for i in digits],
        "Building": [buildings[i] for i in digits],
        "Prof": [profs[i] for i in digits],
    }

    lab_part = {
        "CourseCode": course["CourseCode"],
        "CourseName": course["CourseName"] + " [Req]",
        "subsection": [subsections[i] for i in letters],
        "Days": [days[i] for i in letters],
        "Times": [times[i] for i in letters],
        "Building": [buildings[i] for i in letters],
        "Prof": [profs[i] for i in letters],
    } if letters else None

    return [class_part] + ([lab_part] if lab_part else [])


if __name__ == '__main__':
    app.run(debug=True)
