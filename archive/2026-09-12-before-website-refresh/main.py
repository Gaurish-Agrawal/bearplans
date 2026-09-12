from itertools import product
from datetime import datetime

# Helper function to convert 24-hour time to minutes since start of the day
def time_to_minutes(time_str):
    time = datetime.strptime(time_str, "%H:%M")
    return time.hour * 60 + time.minute

# Helper function to check if two time slots overlap
def times_overlap(times1, times2):
    start1, end1 = time_to_minutes(times1[0]), time_to_minutes(times1[1])
    start2, end2 = time_to_minutes(times2[0]), time_to_minutes(times2[1])
    return not (end1 <= start2 or end2 <= start1)

# Helper function to convert days string to a set of days
def days_to_set(days_str):
    days_map = {'M': 'Monday', 'T': 'Tuesday', 'W': 'Wednesday', 'R': 'Thursday', 'F': 'Friday'}
    days = set()
    for day, name in days_map.items():
        if day in days_str:
            days.add(name)
    return days

overlap_memo = {}
global noClassBefore
global noClassAfter

noClassBefore, noClassAfter = '',''

global timeStart
global timeEnd

timeStart,timeEnd = '',''

def is_time_between(time1,time2,time3,time4):
    time1 = time_to_minutes(time1)
    time2 = time_to_minutes(time2)

    time3 = time_to_minutes(time3)
    time4 = time_to_minutes(time4)

    start1, end1 = min(time1, time2), max(time1, time2)
    start2, end2 = min(time3, time4), max(time3, time4)
    
    # Check for overlap
    return start1 <= end2 and start2 <= end1

def backtrack_schedules(courses, combination, selected_sections, maxnumber):

    global noClassBefore
    global noClassAfter

    global timeStart
    global timeEnd

    if len(combination) == len(courses): #full course generated
        return [combination[:]]
    
    valid_schedules = []
    course_index = len(combination)
    for subsection_index in range(len(courses[course_index]['subsection'])):
        days = courses[course_index]['Days'][subsection_index]
        times = courses[course_index]['Times'][subsection_index]
        
        

        #checking if time works with user's 'me time'
        sq = False

        for i in range(len(timeStart)):
            ts = timeStart[i]
            te = timeEnd[i]
        
            if ts!="None" and te!="None":
                print(ts," to ",te)
            
                for k in range(0,len(times)-1):
                    if is_time_between(ts,te,times[k],times[k+1]):
                        print("True!")
                        sq = True
                        break
                    break

        if int(time_to_minutes(times[0])) < int(time_to_minutes(noClassBefore)):
            continue

        if int(time_to_minutes(times[1])) > int(time_to_minutes(noClassAfter)):
            continue


        valid = True
        for days2, times2 in selected_sections:

            if days_to_set(days) & days_to_set(days2) and times_overlap(times, times2):
                valid = False
                break
        
        if valid and not sq:
            if len(valid_schedules) >= maxnumber+1:
                return valid_schedules[0:maxnumber+1]
            combination.append(subsection_index)
            selected_sections.append((days, times))
            valid_schedules += backtrack_schedules(courses, combination, selected_sections, maxnumber)
            combination.pop()
            selected_sections.pop()
            
            
    return valid_schedules[0:maxnumber+1]


def generate_schedules(courses, maxnumber,ncb,nca,timeStartList,timeEndList):
    global noClassBefore
    global noClassAfter
    global timeStart
    global timeEnd

    noClassBefore, noClassAfter = ncb, nca
    timeStart,timeEnd = timeStartList,timeEndList
    return backtrack_schedules(courses, [], [], maxnumber)