from datetime import datetime
import time as _time

# Time helpers

DAY_BITS = range(7)
TIMEOUT_SECONDS = 10
DIAGNOSE_TIMEOUT = 2


def time_to_minutes(time_str):
    t = datetime.strptime(time_str, "%H:%M")
    return t.hour * 60 + t.minute


def times_overlap(times1, times2):
    s1, e1 = time_to_minutes(times1[0]), time_to_minutes(times1[1])
    s2, e2 = time_to_minutes(times2[0]), time_to_minutes(times2[1])
    return intervals_overlap(s1, e1, s2, e2)


def intervals_overlap(start1, end1, start2, end2):
    return start1 < end2 and start2 < end1


def days_to_mask(days_str):
    if not days_str:
        return 0

    mask = 0
    for idx, day in enumerate(str(days_str)[:7]):
        if day != "-":
            mask |= 1 << idx
    return mask


def days_to_set(days_str):
    return {c for c in str(days_str or "") if c != "-"}


def is_time_between(t1, t2, t3, t4):
    a1, a2 = time_to_minutes(t1), time_to_minutes(t2)
    b1, b2 = time_to_minutes(t3), time_to_minutes(t4)
    s1, e1 = min(a1, a2), max(a1, a2)
    s2, e2 = min(b1, b2), max(b1, b2)
    return intervals_overlap(s1, e1, s2, e2)


# Schedule generator

def _as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _time_window(value, fallback):
    if not value:
        return fallback
    return time_to_minutes(value)


def _blocked_ranges(time_start, time_end):
    ranges = []
    starts = _as_list(time_start)
    ends = _as_list(time_end)

    for idx, start in enumerate(starts):
        end = ends[idx] if idx < len(ends) else None
        if not start or not end or start == "None" or end == "None":
            continue

        start_min = time_to_minutes(start)
        end_min = time_to_minutes(end)
        if start_min == end_min:
            continue

        ranges.append((min(start_min, end_min), max(start_min, end_min)))

    return ranges


def _section_is_blocked(start_min, end_min, blocked_ranges):
    for block_start, block_end in blocked_ranges:
        if intervals_overlap(start_min, end_min, block_start, block_end):
            return True
    return False


def option_meetings(days_value, times_value):
    """Return one or more meeting pairs for a single selectable section."""
    if (
        isinstance(times_value, (list, tuple))
        and len(times_value) >= 2
        and not isinstance(times_value[0], (list, tuple))
    ):
        time_ranges = [times_value]
    elif isinstance(times_value, (list, tuple)):
        time_ranges = list(times_value)
    else:
        return []

    day_values = list(days_value) if isinstance(days_value, (list, tuple)) else [days_value]
    meetings = []
    for index, time_range in enumerate(time_ranges):
        if not isinstance(time_range, (list, tuple)) or len(time_range) < 2:
            continue
        days = day_values[index] if index < len(day_values) else day_values[-1] if day_values else None
        meetings.append({"days": days, "times": [time_range[0], time_range[1]]})
    return meetings


def _prepare_sections(courses, no_class_before, no_class_after, time_start, time_end):
    before_min = _time_window(no_class_before, 0)
    after_min = _time_window(no_class_after, 24 * 60)
    blocked_ranges = _blocked_ranges(time_start, time_end)

    prepared = []

    for course_idx, course in enumerate(courses):
        course_sections = []
        subsections = course.get("subsection", [])
        days_list = course.get("Days", [])
        times_list = course.get("Times", [])

        for sub_idx in range(len(subsections)):
            if sub_idx >= len(days_list) or sub_idx >= len(times_list):
                continue

            meetings = []
            option_is_valid = True
            for meeting in option_meetings(days_list[sub_idx], times_list[sub_idx]):
                day_mask = days_to_mask(meeting["days"])
                if not day_mask:
                    option_is_valid = False
                    break

                start_min = time_to_minutes(meeting["times"][0])
                end_min = time_to_minutes(meeting["times"][1])
                if start_min >= end_min:
                    option_is_valid = False
                    break
                if start_min < before_min or end_min > after_min:
                    option_is_valid = False
                    break
                if _section_is_blocked(start_min, end_min, blocked_ranges):
                    option_is_valid = False
                    break

                if any(
                    day_mask & existing["day_mask"]
                    and intervals_overlap(start_min, end_min, existing["start"], existing["end"])
                    for existing in meetings
                ):
                    option_is_valid = False
                    break

                meetings.append({
                    "day_mask": day_mask,
                    "start": start_min,
                    "end": end_min,
                })

            if not option_is_valid or not meetings:
                continue

            course_sections.append({
                "course_idx": course_idx,
                "sub_idx": sub_idx,
                "meetings": meetings,
            })

        if not course_sections:
            return None

        prepared.append(course_sections)

    return prepared


def _fits(section, occupied_by_day):
    for meeting in section["meetings"]:
        for day_idx in DAY_BITS:
            if not meeting["day_mask"] & (1 << day_idx):
                continue

            for start_min, end_min in occupied_by_day[day_idx]:
                if intervals_overlap(meeting["start"], meeting["end"], start_min, end_min):
                    return False

    return True


def _place(section, occupied_by_day):
    touched_days = []
    for meeting in section["meetings"]:
        for day_idx in DAY_BITS:
            if meeting["day_mask"] & (1 << day_idx):
                occupied_by_day[day_idx].append((meeting["start"], meeting["end"]))
                touched_days.append(day_idx)
    return touched_days


def _unplace(occupied_by_day, touched_days):
    for day_idx in touched_days:
        occupied_by_day[day_idx].pop()


def _generate_schedules(courses, max_results, ncb, nca, time_start, time_end, timeout):
    if not courses or max_results <= 0:
        return []

    no_class_before = ncb if ncb else "00:00"
    no_class_after = nca if nca else "23:59"
    prepared_sections = _prepare_sections(courses, no_class_before, no_class_after, time_start, time_end)
    if not prepared_sections:
        return []

    results = []
    assigned = [None] * len(courses)
    occupied_by_day = [[] for _ in DAY_BITS]
    start_time = _time.time()

    def search(remaining_courses):
        if len(results) >= max_results:
            return
        if _time.time() - start_time > timeout:
            return
        if not remaining_courses:
            results.append(assigned[:])
            return

        best_course_idx = None
        best_sections = None

        for course_idx in remaining_courses:
            compatible = [
                section
                for section in prepared_sections[course_idx]
                if _fits(section, occupied_by_day)
            ]

            if not compatible:
                return

            if best_sections is None or len(compatible) < len(best_sections):
                best_course_idx = course_idx
                best_sections = compatible
                if len(best_sections) == 1:
                    break

        next_remaining = [idx for idx in remaining_courses if idx != best_course_idx]

        for section in best_sections:
            assigned[best_course_idx] = section["sub_idx"]
            touched_days = _place(section, occupied_by_day)
            search(next_remaining)
            _unplace(occupied_by_day, touched_days)
            assigned[best_course_idx] = None

            if len(results) >= max_results or _time.time() - start_time > timeout:
                return

    search(list(range(len(courses))))
    return results


def backtrack_schedules(courses, combination, selected_sections, max_results,
                        no_class_before, no_class_after, time_start, time_end,
                        start_time, timeout=None):
    if timeout is None:
        timeout = TIMEOUT_SECONDS

    return _generate_schedules(
        courses,
        max_results,
        no_class_before,
        no_class_after,
        time_start,
        time_end,
        timeout,
    )


def _quick_check(courses, ncb, nca, ts, te, limit=3):
    if not courses:
        return 0
    return len(_generate_schedules(courses, limit, ncb, nca, ts, te, DIAGNOSE_TIMEOUT))


def generate_schedules(courses, maxnumber, ncb, nca, timeStartList, timeEndList):
    if not courses:
        return []

    if maxnumber < 0:
        max_results = 500
    else:
        max_results = min(maxnumber + 1, 500)

    return _generate_schedules(
        courses,
        max_results,
        ncb,
        nca,
        _as_list(timeStartList),
        _as_list(timeEndList),
        TIMEOUT_SECONDS,
    )


# No-schedule diagnosis

def _format_hour(time_str):
    hour = int(time_str.split(":")[0])
    minute = int(time_str.split(":")[1])
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12 or 12
    if minute:
        return f"{display_hour}:{minute:02d} {suffix}"
    return f"{display_hour} {suffix}"


def diagnose_no_schedule(courses, ncb, nca, timeStartList, timeEndList):
    """
    When generate_schedules returns 0 results, call this to find out what
    small changes would produce a valid schedule.
    """
    no_class_before = ncb if ncb else "00:00"
    no_class_after = nca if nca else "23:59"
    time_start = _as_list(timeStartList)
    time_end = _as_list(timeEndList)

    suggestions = []
    overall_start = _time.time()

    for i in range(len(courses)):
        if _time.time() - overall_start > 15:
            break
        reduced = courses[:i] + courses[i + 1:]
        count = _quick_check(reduced, no_class_before, no_class_after, time_start, time_end)
        if count > 0:
            suggestions.append({
                "type": "drop_one",
                "course": courses[i].get("CourseName", f"Course {i + 1}"),
                "count": count,
                "display": f"Drop {courses[i].get('CourseName', f'Course {i + 1}')}",
            })

    if no_class_before != "00:00":
        count = _quick_check(courses, "00:00", no_class_after, time_start, time_end)
        if count > 0:
            suggestions.append({
                "type": "relax_before",
                "old": no_class_before,
                "display": f"Allow classes before {_format_hour(no_class_before)}",
                "count": count,
            })

    if no_class_after != "23:59":
        count = _quick_check(courses, no_class_before, "23:59", time_start, time_end)
        if count > 0:
            suggestions.append({
                "type": "relax_after",
                "old": no_class_after,
                "display": f"Allow classes after {_format_hour(no_class_after)}",
                "count": count,
            })

    for i, ts in enumerate(time_start):
        te = time_end[i] if i < len(time_end) else None
        if ts and te and ts != "None" and te != "None":
            if _time.time() - overall_start > 15:
                break
            new_ts = time_start[:i] + time_start[i + 1:]
            new_te = time_end[:i] + time_end[i + 1:]
            count = _quick_check(courses, no_class_before, no_class_after, new_ts, new_te)
            if count > 0:
                suggestions.append({
                    "type": "remove_block",
                    "block": f"{ts}-{te}",
                    "display": f"Remove the {_format_hour(ts)}-{_format_hour(te)} blocked time",
                    "count": count,
                })

    if not any(s["type"] == "drop_one" for s in suggestions) and len(courses) <= 8:
        from itertools import combinations

        for i, j in combinations(range(len(courses)), 2):
            if _time.time() - overall_start > 15:
                break
            reduced = [c for idx, c in enumerate(courses) if idx != i and idx != j]
            count = _quick_check(reduced, no_class_before, no_class_after, time_start, time_end)
            if count > 0:
                first = courses[i].get("CourseName", f"Course {i + 1}")
                second = courses[j].get("CourseName", f"Course {j + 1}")
                suggestions.append({
                    "type": "drop_pair",
                    "courses": [first, second],
                    "display": f"Drop {first} and {second}",
                    "count": count,
                })

    suggestions.sort(key=lambda s: -s["count"])
    return suggestions[:5]
