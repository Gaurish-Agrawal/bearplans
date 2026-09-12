"""
WashU Course Catalog Scraper
=============================
Scrapes course data from the PUBLIC registrar page:
  https://registrar.washu.edu/classes-registration/class-schedule-search/

NO LOGIN REQUIRED.

Output format matches the course planner JSON schema:
{
    "Course Title": {
        "CourseCode": "DEPT 1234",
        "CourseName": "Course Title",
        "Description": "...",
        "subsection": ["01", "02"],
        "Days": ["M-W----", "-T-R---"],
        "Times": [["08:30","09:50"], ["10:00","11:20"]],
        "Building": ["Room 00105", null],
        "Prof": ["Last, First", null]
    }
}

Requirements:
  pip install requests beautifulsoup4 lxml

Usage:
  python washu_scraper.py                                    # Default: 2026 Spring, all schools
  python washu_scraper.py --term "2026 Fall"
  python washu_scraper.py --school "McKelvey School of Engineering"
  python washu_scraper.py --output courses.json
  python washu_scraper.py --auto --interval 24               # Re-scrape every 24 hours
"""

import requests
from bs4 import BeautifulSoup
import json
import argparse
import re
import time
import sys
from datetime import datetime

BASE_URL = "https://registrar.washu.edu/classes-registration/class-schedule-search/"

SCHOOLS = [
    "Arts & Sciences",
    "Brown School",
    "McKelvey School of Engineering",
    "Olin Business School",
    "Sam Fox School of Design & Visual Arts",
    "School of Continuing & Professional Studies",
    "School of Law",
    "School of Medicine",
    "School of Public Health",
    "Washington University in St. Louis",
]

# Maps day names from the registrar page to the 7-char format: M-W-F-- / -T-R--- etc.
DAY_CHAR_MAP = {
    "Mon": 0,
    "Tue": 1,
    "Wed": 2,
    "Thu": 3,
    "Fri": 4,
    "Sat": 5,
    "Sun": 6,
}


def days_to_code(day_string: str) -> str:
    """
    Convert day names like "Mon Wed Fri" to the 7-char code "M-W-F--".
    Uses: M=Mon, T=Tue, W=Wed, R=Thu, F=Fri, S=Sat, U=Sun
    """
    if not day_string or not day_string.strip():
        return None

    chars = list("-------")
    labels = "MTWRFSU"

    for token in day_string.strip().split():
        token = token.strip().rstrip(",")
        idx = DAY_CHAR_MAP.get(token)
        if idx is not None:
            chars[idx] = labels[idx]

    result = "".join(chars)
    return result if result != "-------" else None


def time_to_24h(time_str: str) -> str:
    """
    Convert "11:30 AM" or "2:30 PM" to 24-hour "11:30" / "14:30".
    """
    if not time_str:
        return None
    time_str = time_str.strip()
    try:
        from datetime import datetime as dt
        t = dt.strptime(time_str, "%I:%M %p")
        return t.strftime("%H:%M")
    except ValueError:
        # Already in 24h or unparseable
        return time_str


def parse_time_range(time_str: str):
    """
    Convert "11:30 AM-12:50 PM" to ["11:30", "12:50"].
    """
    if not time_str or not time_str.strip():
        return None
    # Split on dash/hyphen, handling possible spaces
    parts = re.split(r'\s*[-–—]\s*', time_str.strip())
    if len(parts) == 2:
        start = time_to_24h(parts[0].strip())
        end = time_to_24h(parts[1].strip())
        if start and end:
            return [start, end]
    return None


def scrape_school(term: str, school: str, session: requests.Session) -> dict:
    """
    Scrape all courses for one school/term combo.
    Returns dict in the target format keyed by course name.
    """
    params = {"term": term, "school": school}

    resp = session.get(BASE_URL, params=params, timeout=120)
    resp.raise_for_status()

    return parse_courses(resp.text)


def parse_courses(html: str) -> dict:
    """
    Parse the registrar HTML into the target JSON format.
    Returns dict keyed by course name.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Get main content text
    content = soup.find("main") or soup.find("div", {"id": "content"}) or soup
    text = content.get_text(separator="\n")
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    courses = {}

    # Patterns
    code_pat = re.compile(r'^([A-Z]{2,10})\s+(\d{3,5}[A-Z]?)$')
    units_pat = re.compile(r'^(Variable|\d+\.?\d*)\s+Units?$')
    seats_pat = re.compile(r'^\d+/\d+$')
    section_num_pat = re.compile(r'^[A-Z0-9]{1,3}$')

    # Labels that appear as field headers in the page
    FIELD_LABELS = {"Section", "Term", "Instructor", "Delivery Mode", "Days", "Time", "Seats Taken"}
    SKIP_LABELS = {"More Info", "Course Details", "Undergraduate", "Graduate", "Submit",
                   "Filter further using keywords", "Clear"}

    i = 0
    while i < len(lines):
        line = lines[i]
        code_match = code_pat.match(line)
        if not code_match:
            i += 1
            continue

        course_code = line  # e.g. "ANTHRO 3100"

        # Title is on the line before the code
        title = lines[i - 1].strip("'\"") if i >= 1 else ""

        i += 1  # move past the code line

        # Units line (optional)
        if i < len(lines) and units_pat.match(lines[i]):
            i += 1

        # Now collect sections
        subsections = []
        days_list = []
        times_list = []
        buildings = []
        profs = []

        # Collect section data
        while i < len(lines):
            # Stop if we hit what looks like the next course code
            # (the line AFTER this one is a course code)
            if i + 1 < len(lines) and code_pat.match(lines[i + 1]):
                break
            if code_pat.match(lines[i]):
                break

            if lines[i] == "Section":
                sec_num = ""
                sec_instructor = None
                sec_days = None
                sec_time = None
                sec_building = None

                i += 1
                # Section number
                if i < len(lines) and section_num_pat.match(lines[i]):
                    sec_num = lines[i]
                    i += 1

                # Read field: value pairs until next Section or end
                while i < len(lines):
                    fl = lines[i]

                    if fl == "Section" or code_pat.match(fl):
                        break
                    if fl == "More Info" or fl == "Course Details":
                        break
                    # Look one ahead to see if next line is a code (meaning this is a title)
                    if i + 1 < len(lines) and code_pat.match(lines[i + 1]):
                        break

                    if fl == "Term" and i + 1 < len(lines):
                        i += 2  # skip term value
                        continue
                    elif fl == "Instructor" and i + 1 < len(lines):
                        i += 1
                        sec_instructor = lines[i] if lines[i] not in FIELD_LABELS and lines[i] not in SKIP_LABELS else None
                        i += 1
                        continue
                    elif fl == "Delivery Mode" and i + 1 < len(lines):
                        i += 2  # skip delivery mode value
                        continue
                    elif fl == "Days" and i + 1 < len(lines):
                        i += 1
                        sec_days = lines[i] if lines[i] not in FIELD_LABELS and lines[i] not in SKIP_LABELS else None
                        i += 1
                        continue
                    elif fl == "Time" and i + 1 < len(lines):
                        i += 1
                        sec_time = lines[i] if lines[i] not in FIELD_LABELS and lines[i] not in SKIP_LABELS else None
                        i += 1
                        continue
                    elif fl == "Seats Taken" and i + 1 < len(lines):
                        i += 2  # skip seats value
                        continue
                    else:
                        i += 1
                        continue

                # Save this section
                subsections.append(sec_num)
                days_list.append(days_to_code(sec_days) if sec_days else None)
                times_list.append(parse_time_range(sec_time) if sec_time else None)
                buildings.append(None)  # registrar page doesn't show rooms consistently
                profs.append(sec_instructor if sec_instructor else None)
                continue

            elif lines[i] == "More Info" or lines[i] == "Course Details":
                i += 1
                break
            else:
                i += 1
                continue

        # Now try to capture description
        description = ""
        # Skip "Course Details", "Undergraduate"/"Graduate" labels
        level = None
        while i < len(lines) and lines[i] in ("Course Details", "Undergraduate", "Graduate", "More Info"):
            if lines[i] in ("Undergraduate", "Graduate"):
                level = lines[i]
            i += 1

        # Collect description lines until we hit something that looks like a new course
        desc_lines = []
        while i < len(lines):
            # If next line is a course code, the current line is probably the title/department
            if i + 1 < len(lines) and code_pat.match(lines[i + 1]):
                break
            if code_pat.match(lines[i]):
                break
            if units_pat.match(lines[i]):
                break
            # Department headers for next course — heuristic: if this line is a known
            # department and the next few lines contain a course code, stop
            if i + 2 < len(lines) and code_pat.match(lines[i + 2]):
                break

            desc_lines.append(lines[i])
            i += 1

        description = " ".join(desc_lines).strip()

        # Build the course entry
        # Use title as the key; handle duplicates by appending code
        key = title
        if key in courses:
            key = f"{title} ({course_code})"

        courses[key] = {
            "CourseCode": course_code,
            "CourseName": title,
            "Description": description if description else None,
            "subsection": subsections,
            "Days": days_list,
            "Times": times_list,
            "Building": buildings,
            "Prof": profs,
        }

    return courses


def scrape_all(term: str, schools: list[str] = None, verbose: bool = True) -> dict:
    """Scrape all schools for a term, merge results."""
    if schools is None:
        schools = SCHOOLS

    session = requests.Session()
    session.headers.update({
        "User-Agent": "WashU-Course-Planner/1.0 (Student Project)"
    })

    all_courses = {}

    for school in schools:
        if verbose:
            print(f"  Scraping: {school}...", end=" ", flush=True)

        try:
            courses = scrape_school(term, school, session)
            if verbose:
                print(f"{len(courses)} courses")

            # Merge, handling key collisions
            for key, val in courses.items():
                if key in all_courses:
                    key = f"{key} ({val['CourseCode']})"
                all_courses[key] = val

        except Exception as e:
            if verbose:
                print(f"ERROR: {e}")

        time.sleep(1)  # be polite

    return all_courses


def main():
    parser = argparse.ArgumentParser(description="Scrape WashU course catalog (public registrar page)")
    parser.add_argument("--term", default="2026 Spring", help="Term (e.g. '2026 Spring')")
    parser.add_argument("--school", default=None, help="Single school, or omit for all schools")
    parser.add_argument("--output", "-o", default="courses.json", help="Output JSON file")
    parser.add_argument("--auto", action="store_true", help="Re-scrape on interval")
    parser.add_argument("--interval", type=int, default=24, help="Hours between scrapes (default: 24)")
    parser.add_argument("--pretty", action="store_true", default=True, help="Pretty-print JSON (default)")

    args = parser.parse_args()
    schools = [args.school] if args.school else None

    def do_scrape():
        print(f"\n{'='*60}")
        print(f"WashU Course Scraper — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Term: {args.term}")
        print(f"{'='*60}")

        courses = scrape_all(args.term, schools)

        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(courses, f, indent=4, ensure_ascii=False)

        print(f"\nTotal: {len(courses)} courses → {args.output}")

    if args.auto:
        print(f"Auto mode: scraping every {args.interval} hours. Ctrl+C to stop.")
        while True:
            try:
                do_scrape()
                print(f"Next scrape in {args.interval} hours...")
                time.sleep(args.interval * 3600)
            except KeyboardInterrupt:
                print("\nStopped.")
                break
            except Exception as e:
                print(f"Error: {e}. Retrying in 5 min...")
                time.sleep(300)
    else:
        do_scrape()


if __name__ == "__main__":
    main()