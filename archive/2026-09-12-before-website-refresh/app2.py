from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import time
import re
import json

courses = {}  # to hold all course dicts

def to_24hr(time_str):
    hour, minute = map(int, time_str[:-3].split(':'))
    if 'PM' in time_str and hour != 12:
        hour += 12
    if 'AM' in time_str and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"

def parse_section_info(label, prof):
    parts = label.split('|')
    
    # Case: only Days and Times present (no building)
    if len(parts) == 2:
        building = None
        days_part = parts[0].strip()
        time_part = parts[1].strip()
    # Case: Building, Days, Times
    elif len(parts) == 3:
        building = parts[0].strip().split(',', 1)[-1].strip()
        days_part = parts[1].strip()
        time_part = parts[2].strip()
    else:
        return None

    # Convert day format to MTWRFSU string
    day_map = {'Mon': 'M', 'Tue': 'T', 'Wed': 'W', 'Thu': 'R', 'Fri': 'F', 'Sat': 'S', 'Sun': 'U'}
    day_str = ['-' for _ in range(7)]
    for day in days_part.split('/'):
        abbr = day.strip()[:3]
        if abbr in day_map:
            pos = "MTWRFSU".index(day_map[abbr])
            day_str[pos] = day_map[abbr]
    formatted_days = ''.join(day_str)

    match = re.match(r'(\d{1,2}:\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}:\d{2})\s*(AM|PM)', time_part)
    if not match:
        return None

    def to_24hr(time_str):
        hour, minute = map(int, time_str[:-3].split(':'))
        if 'PM' in time_str and hour != 12:
            hour += 12
        if 'AM' in time_str and hour == 12:
            hour = 0
        return f"{hour:02d}:{minute:02d}"

    start_time = to_24hr(match.group(1) + " " + match.group(2))
    end_time = to_24hr(match.group(3) + " " + match.group(4))

    return {
        "Days": formatted_days,
        "Times": [start_time, end_time],
        "Building": building,
        "Prof": prof
    }

def scrape_course_sections():
    options = Options()
    options.add_argument("user-data-dir=/Users/gaurishagrawal/Library/Application Support/Google/Chrome/Profile 2")
    driver = webdriver.Chrome(options=options)

    try:
        driver.get("https://www.myworkday.com/wustl/d/task/1422$10602.htmld#backheader=true")
        input("Please log in and press Enter once the course list is fully loaded...")

        # Scroll to load everything
        last_height = driver.execute_script("return document.body.scrollHeight")
        while True:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height

        course_items = driver.find_elements(By.CSS_SELECTOR, "li[data-automation-id='compositeContainer']")
        
        previous_course_name = None
        current_course_dict = None

        for item in course_items:
            try:
                title_element = item.find_element(By.CSS_SELECTOR, "div[data-automation-id='compositeToggleIcon']")

                # Get professor BEFORE expanding
                prof = None
                try:
                    selected = item.find_element(By.CSS_SELECTOR, "ul[data-automation-id='selectedItemList'] div[role='option']")
                    prof_label = selected.get_attribute("aria-label").strip()
                    prof = prof_label
                except:
                    pass

                # Expand item
                driver.execute_script("arguments[0].click();", title_element)
                time.sleep(0.5)

                # Get full course title
                full_title = title_element.get_attribute("aria-label").strip()
                if full_title.lower().startswith("more "):
                    full_title = full_title[5:].strip()

                match = re.match(r"([A-Z]+\s*\d+)-([A-Z0-9]+)\s*[–-]\s*(.+)", full_title)
                if not match:
                    print("❌ Could not parse title:", full_title)
                    continue

                course_code = match.group(1).strip()
                subsection = match.group(2).strip()
                course_name = match.group(3).strip()

                if "independent study" in course_name.lower():
                    continue

                # Print and reset if new course
                if previous_course_name and course_name != previous_course_name and current_course_dict:
                    courses[previous_course_name] = current_course_dict
                    current_course_dict = None

                if current_course_dict is None:
                    current_course_dict = {
                        "CourseCode": course_code,
                        "CourseName": course_name,
                        "subsection": [],
                        "Days": [],
                        "Times": [],
                        "Building": [],
                        "Prof": []
                    }

                # Parse each section label
                section_divs = item.find_elements(By.CSS_SELECTOR, "div[data-automation-id='menuItem']")
                for div in section_divs:
                    label = div.get_attribute("aria-label")
                    if label:
                        section = parse_section_info(label, prof)
                        if section:
                            current_course_dict["subsection"].append(subsection)
                            current_course_dict["Days"].append(section["Days"])
                            current_course_dict["Times"].append(section["Times"])
                            current_course_dict["Building"].append(section["Building"])
                            current_course_dict["Prof"].append(section["Prof"])

                previous_course_name = course_name

            except Exception as e:
                print("⛔️ Skipped item due to error:", e)
                continue

        print("final kuru")
        # Print final course
        if current_course_dict and current_course_dict["subsection"]:
            print(json.dumps(current_course_dict, indent=4))
            courses[previous_course_name] = current_course_dict  # save only if sections exist
            print(previous_course_name)

    finally:
        with open("all_courses.json", "w") as f:
            json.dump(courses, f, indent=4)

        print("\n✅ All courses saved to all_courses.json")
        
        driver.quit()

scrape_course_sections()

"""
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from collections import defaultdict
import time
import re
import json

def to_24hr(time_str):
    hour, minute = map(int, time_str[:-3].split(':'))
    if 'PM' in time_str and hour != 12:
        hour += 12
    if 'AM' in time_str and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"

def parse_section_info(label):
    parts = label.split('|')
    if len(parts) != 3:
        return None

    prof_raw = parts[0].strip()
    building = prof_raw.split(',', 1)[-1].strip()
    prof = prof_raw.split(',')[0].strip()

    day_map = {'Mon': 'M', 'Tue': 'T', 'Wed': 'W', 'Thu': 'R', 'Fri': 'F', 'Sat': 'S', 'Sun': 'U'}
    day_str = ['-' for _ in range(7)]
    for day in parts[1].strip().split('/'):
        abbr = day.strip()[:3]
        if abbr in day_map:
            pos = "MTWRFSU".index(day_map[abbr])
            day_str[pos] = day_map[abbr]
    formatted_days = ''.join(day_str)

    match = re.match(r'(\d{1,2}:\d{2})\s*(AM|PM)\s*–\s*(\d{1,2}:\d{2})\s*(AM|PM)', parts[2].strip())
    if not match:
        return None
    start_time = to_24hr(match.group(1) + " " + match.group(2))
    end_time = to_24hr(match.group(3) + " " + match.group(4))

    return {
        "Days": formatted_days,
        "Times": [start_time, end_time],
        "Building": building,
        "Prof": prof
    }

def scrape_course_sections():
    options = Options()
    options.add_argument("user-data-dir=/Users/gaurishagrawal/Library/Application Support/Google/Chrome/Profile 2")
    driver = webdriver.Chrome(options=options)

    driver.get("https://www.myworkday.com/wustl/d/task/1422$10602.htmld#backheader=true")
    input("Please log in and press Enter once the course list is fully loaded...")

    last_height = driver.execute_script("return document.body.scrollHeight")
    while True:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height

    raw_data = defaultdict(list)
    course_items = driver.find_elements(By.CSS_SELECTOR, "li[data-automation-id='compositeContainer']")

    for item in course_items:
        try:
            title_element = item.find_element(By.CSS_SELECTOR, "div[data-automation-id='compositeToggleIcon']")
            full_title = title_element.get_attribute("aria-label").strip()
            cook = full_title.split("-")
            code = cook[0].strip()
            subsection = cook[1].strip()
            name = cook[-1].strip()
            
            driver.execute_script("arguments[0].click();", title_element)
            time.sleep(0.5)  # wait for section to expand

            section_divs = item.find_elements(By.CSS_SELECTOR, "div[data-automation-id='menuItem']")
            if section_divs:
                for div in section_divs:
                    label = str(div.get_attribute("aria-label"))
                    building,day,time, proffs = None, None, None, None
                    if "|" in label:
                        label = [i.strip() for i in label.split("|")]
                        building = label[0].strip()
                        day = label[1].strip()
                        time = label[-1].strip()

                    if "," in label:
                        proff = label.strip()

            #add code here
                    

            
            else:
                print("none")
       

        except:
            print("SKIPPED")

    driver.quit()

    """