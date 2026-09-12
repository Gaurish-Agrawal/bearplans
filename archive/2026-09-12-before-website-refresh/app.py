from flask import Flask, request, render_template, jsonify, redirect, url_for, session
import json
from itertools import permutations
from itertools import combinations
from main import generate_schedules
from datetime import datetime
import random
import os



app = Flask(__name__)
app.secret_key = 'your_secret_key'

with open("static/jsonfiles/all_courses.json", 'r') as file:
    coursesMain = json.load(file)

dataschool = []
displayDistances = {}

global matched_schedule
matched_schedule = None  # Add this at the top of your file
global friendMatchedSchedule
friendMatchedSchedule = None

"""
@app.route('/save_shared_schedule', methods=['POST'])
def save_shared_schedule():
    # Ensure the folder exists
    if not os.path.exists('shared_schedules'):
        os.makedirs('shared_schedules')

    data = request.get_json()
    schedules = data.get("schedules", [])
    
    if not schedules:
        return jsonify({"error": "No schedules provided"}), 400

    import random, json
    code = "BP"+''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=6))

    # Save to file
    # You likely have:
    schedules = request.json["schedules"]       
    with open(f"shared_schedules/{code}.json", "w") as f:
        json.dump(schedules, f)

    return jsonify({"code": code})
"""


@app.route('/save_shared_schedule', methods=['POST'])
def save_shared_schedule():
    # Ensure folders exist
    os.makedirs('shared_schedules', exist_ok=True)
    os.makedirs('shared_codes', exist_ok=True)

    data = request.get_json()
    schedules = data.get("schedules", [])

    if not schedules:
        return jsonify({"error": "No schedules provided"}), 400

    # Try to read the previously stored code (if any)
    code_path = "shared_codes/current_code.txt"
    old_code = None
    if os.path.exists(code_path):
        with open(code_path, "r") as f:
            old_code = f.read().strip()

    # Delete the old file
    if old_code:
        old_file = f"shared_schedules/{old_code}.json"
        if os.path.exists(old_file):
            os.remove(old_file)

    # Generate a new code
    code = "BP" + ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=6))

    # Save new schedule file
    with open(f"shared_schedules/{code}.json", "w") as f:
        json.dump(schedules, f)

    # Save new code to local tracking file
    with open(code_path, "w") as f:
        f.write(code)

    return jsonify({"code": code})

global code
code = None

@app.route('/view_last_shared_schedule')
def view_last_shared_schedule():
    global code
    try:
        # Read the last saved code
        with open("shared_codes/current_code.txt", "r") as f:
            code = f.read().strip()

        # Load the schedule file
        with open(f"shared_schedules/{code}.json", "r") as f:
            schedule = json.load(f)

        # Optional: set global for matched_schedule so you can render it on a shared timetable page
        global matched_schedule
        matched_schedule = schedule
        code = code

        return jsonify({"status": "ok", "schedule": schedule})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    


@app.route('/get_shared_schedule/<code>')
def get_shared_schedule(code):
    try:
        with open(f"shared_schedules/{code.upper()}.json", "r") as f:
            schedules = json.load(f)

        # Flatten each schedule if it's wrapped in a single-item list
        schedules = [s[0] if isinstance(s, list) and len(s) == 1 else s for s in schedules]

       
        response = jsonify({"schedules": schedules})
        return response

    except FileNotFoundError:
        return jsonify({"error": "Code not found"}), 404
    

@app.route('/')
def index():
    course_group = {"blank": [""]}
    course_group["all"] = sorted(list(coursesMain))

    return render_template('index.html',
                           course_list=sorted(list(coursesMain)),
                           )

@app.route('/get_professors', methods=['POST'])
def get_professors():
    data = request.json
    selected_courses = data.get('items', [])

    course_professors = {}
    for course_name in selected_courses:
        course_data = coursesMain.get(course_name)
        if not course_data:
            continue
        professors = set(course_data['Prof'])
        course_professors[course_name] = sorted(professors)

    return jsonify(course_professors)

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
            if day != '-':
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
    rounded_times = []
    for time in times:
        hour, minute = map(int, time.split(':'))
        rounded_times.append(f"{hour:02d}:00")
    rounded_hours = sorted(int(time.split(':')[0]) for time in rounded_times)
    full_hours = [f"{hour:02d}:00" for hour in range(rounded_hours[0], rounded_hours[-1] + 1)]
    return full_hours

def is_lab_combo(subsections):
    digits = [s for s in subsections if s.isdigit()]
    letters = [s for s in subsections if s.isalpha()]
    return len(digits) > 0 and len(letters) > 0

def split_class_and_lab(course):
    subsections = course['subsection']
    days = course['Days']
    times = course['Times']
    buildings = course['Building']
    profs = course['Prof']

    digits = [i for i, s in enumerate(subsections) if s.isdigit()]
    letters = [i for i, s in enumerate(subsections) if s.isalpha()]

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
        "CourseName": course["CourseName"] + " [Lab]",
        "subsection": [subsections[i] for i in letters],
        "Days": [days[i] for i in letters],
        "Times": [times[i] for i in letters],
        "Building": [buildings[i] for i in letters],
        "Prof": [profs[i] for i in letters],
    } if letters else None

    return [class_part] + ([lab_part] if lab_part else [])

@app.route('/process_items', methods=['POST'])
def process_items():
    global dataschool
    global displayDistances
    dataschool = []
    displayDistances = {}

    datas = request.json
    maxnumber = int(datas.get('maxnumber')) - 1

    noClassBefore = datas.get('noClassBefore') or "00:00"
    noClassAfter = datas.get('noClassAfter') or "23:59"
    timeStart = datas.get('timeStart', [])
    timeEnd = datas.get('timeEnd', [])
    wantDistance = datas.get('showDistance')

    if isinstance(timeStart, str): timeStart = [timeStart]
    if isinstance(timeEnd, str): timeEnd = [timeEnd]
    if maxnumber < 0: maxnumber = 10**6

    #here
    selected_courses = datas.get('items', [])
    preferred_profs = datas.get('preferredProfs', {})  # Step 5: Get professor filter

    def is_prof_allowed(classs,prof):
        print(classs, prof)
        return prof in preferred_profs[classs]
    
    courses = []
    for course_name in selected_courses:
        raw = coursesMain[course_name]

        # Filter profs based on preference
        keep_indices = [i for i, prof in enumerate(raw["Prof"]) if is_prof_allowed(raw["CourseName"], prof)]
        if not keep_indices:
            continue  # Skip if no profs match

        filtered_course = {
            "CourseCode": raw["CourseCode"],
            "CourseName": raw["CourseName"],
            "subsection": [raw["subsection"][i] for i in keep_indices],
            "Days": [raw["Days"][i] for i in keep_indices],
            "Times": [raw["Times"][i] for i in keep_indices],
            "Building": [raw["Building"][i] for i in keep_indices],
            "Prof": [raw["Prof"][i] for i in keep_indices]
        }

        # Handle lab splitting if needed
        if is_lab_combo(filtered_course["subsection"]):
            courses.extend(split_class_and_lab(filtered_course))
        else:
            courses.append(filtered_course)


    valid_schedules = generate_schedules(courses, maxnumber, noClassBefore, noClassAfter, timeStart, timeEnd)

    tempdictcolors = {}
    pastel_colors = ["#FFEBEF", "#FFEADC", "#FFFFE5", "#E5FFEE", "#E5F4FF", "#FFEAF3", "#E5FFF8", "#EDE5FF"]
    multipleSched = []

    for idx, schedule in enumerate(valid_schedules):
        data = {}
        for course_index, subsection_index in enumerate(schedule):
            c = courses[course_index]
            value = {
                "days": c['Days'][subsection_index],
                "times": round_down_time(c['Times'][subsection_index]),
                "prof": c['Prof'][subsection_index].title(),
                "building": c['Building'][subsection_index],
                "subsection": c['subsection'][subsection_index],
                "code": c['CourseCode'],
                "timestring": convert_to_ampm(c['Times'][subsection_index]),
                "boxcolor": tempdictcolors.get(c['CourseName'], pastel_colors.pop(0) if pastel_colors else "#F0F0F0")
            }
            tempdictcolors[c['CourseName']] = value['boxcolor']
            data[c['CourseName']] = value

        if wantDistance:
            weekPlan = getDays(list(data.values()))
            multipleSched.append(weekPlan)

        dataschool.append(data)

    #block distances
    wantDistance = False
    if wantDistance:
        with open("static/walkingdist.json", 'r') as file:
            distance_data = json.load(file)
        for index, week in enumerate(multipleSched):
            v = []
            for day, locs in week.items():
                if len(locs) <= 1:
                    v.append("")
                    continue
                dv = []
                for i in range(len(locs) - 1):
                    try:
                        s = f"{locs[i].split()[0]}-{locs[i+1].split()[0]}"
                        if s not in distance_data:
                            s = f"{locs[i+1].split()[0]}-{locs[i].split()[0]}"
                        d = distance_data.get(s, {})
                        string = s + ": " + d.get("duration", "Unknown") + " | " + d.get("distance", "Unknown")
                        dv.append(string)
                    except:
                        dv.append("Unknown")
                v.append(dv)
            displayDistances[index + 1] = v


    return redirect(url_for('render_timetable')) if valid_schedules else redirect(url_for('render_no_timetable'))

@app.route('/render_timetable')
def render_timetable():
    global dataschool
    global displayDistances
    return render_template('timetable.html', school=dataschool, displayDistances=displayDistances, matchedlist=False,friendMatchedSchedule=None)

@app.route('/render_no_timetable')
def render_no_timetable():
    return render_template('no_timetable.html')


global overlapping_courses
overlapping_courses = []

@app.route("/render_timetable_check")
def render_timetable_check():
    global matched_schedule
    global friendMatchedSchedule

    if not matched_schedule:
        return "Error: No matched schedule loaded."
    
    best = matched_schedule[0]

    # Dummy distances to avoid template crash
    dummy_distances = {1: [[] for _ in range(6)]}

    return render_template(
        "timetable.html",
        school=[best],
        displayDistances=dummy_distances,
        matchedlist=False,  # Optional flag if you still want to signal a matched schedule
        friendMatchedSchedule=friendMatchedSchedule,
        sharedList=True,
        code=code
    )

@app.route('/render_timetable2')
def render_timetable2():
    global matched_schedule
    global overlapping_courses
    global friendMatchedSchedule

    if not matched_schedule:
        return "Error: No matched schedule loaded."
    
    best = matched_schedule

    # Mark each course as matched or not
    for course_name, info in best.items():
        info['matched'] = course_name in overlapping_courses

    # Dummy distances to avoid template crash
    dummy_distances = {1: [[] for _ in range(6)]}

    print(best)

    return render_template(
        "timetable.html",
        school=[best],
        displayDistances=dummy_distances,
        matchedlist=True,  # Optional flag if you still want to signal a matched schedule
        friendMatchedSchedule=friendMatchedSchedule,
    )


@app.route('/set_matched_schedule', methods=['POST'])
def set_matched_schedule():
    global matched_schedule, overlapping_courses, friendMatchedSchedule
    data = request.get_json()
    matched_schedule = data.get("matchedSchedule", [])
    overlapping_courses = data.get("overlappingCourses", [])
    friendMatchedSchedule = data.get("friendMatchedSchedule",0)
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    app.run(debug=True)