import unittest

import app as bearplans
from main import generate_schedules


class WorkdayIntegrationTests(unittest.TestCase):
    def setUp(self):
        bearplans.app.config.update(TESTING=True, SECRET_KEY="test-secret")
        bearplans.SCHEDULE_CACHE.clear()
        bearplans.NO_SCHEDULE_CACHE.clear()
        bearplans.MATCH_CACHE.clear()
        self.client = bearplans.app.test_client()

    def test_health_endpoint(self):
        response = self.client.get("/api/workday/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok", "apiVersion": 1})

    def test_same_section_keeps_all_meeting_patterns(self):
        courses = bearplans.normalize_workday_courses([
            {
                "courseCode": "CSE 1310",
                "courseName": "Introduction to Computer Science",
                "sections": [
                    {
                        "section": "01",
                        "meetings": [
                            {"days": "Mon", "startTime": "9:00 AM", "endTime": "9:50 AM"},
                            {"days": "Wed", "startTime": "9:00 AM", "endTime": "9:50 AM"},
                        ],
                        "academicPeriod": "Fall 2025",
                    }
                ],
            }
        ])

        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]["subsection"], ["01"])
        self.assertEqual(courses[0]["Days"], [["M------", "--W----"]])
        self.assertEqual(courses[0]["Times"], [[['09:00', '09:50'], ['09:00', '09:50']]])
        self.assertEqual(courses[0]["AcademicPeriod"], ["Fall 2025"])

    def test_flat_extension_payload_groups_all_section_options(self):
        courses = bearplans.normalize_workday_courses([
            {
                "courseCode": "BME 4191",
                "courseName": "Biomedical Data Science",
                "sections": [
                    {"section": "01", "days": "Mon/Wed", "startTime": "10:00 AM", "endTime": "11:20 AM"},
                    {"section": "02", "days": "Tue/Thu", "startTime": "1:00 PM", "endTime": "2:20 PM"},
                    {"section": "02", "days": "Fri", "startTime": "9:00 AM", "endTime": "9:50 AM"},
                    {"section": "03", "status": "Closed", "days": "Mon", "startTime": "3:00 PM", "endTime": "4:00 PM"},
                ],
            }
        ])

        self.assertEqual(courses[0]["subsection"], ["01", "02"])
        self.assertEqual(courses[0]["Days"][0], "M-W----")
        self.assertEqual(courses[0]["Days"][1], ["-T-R---", "----F--"])
        self.assertEqual(courses[0]["Times"][1], [["13:00", "14:20"], ["09:00", "09:50"]])

    def test_multi_meeting_conflict_checks_every_meeting(self):
        courses = [
            {
                "CourseCode": "CSE 1310",
                "CourseName": "Introduction to Computer Science",
                "subsection": ["01", "02"],
                "Days": [["M------", "--W----"], "-T-----"],
                "Times": [[['09:00', '10:00'], ['09:00', '10:00']], ['09:00', '10:00']],
                "Building": [["Lopata", "Lopata"], "Lopata"],
                "Prof": [["Ada", "Ada"], "Grace"],
            },
            {
                "CourseCode": "CHEM 2501",
                "CourseName": "Organic Chemistry I",
                "subsection": ["01"],
                "Days": ["--W----"],
                "Times": [["09:30", "10:30"]],
                "Building": ["Simon"],
                "Prof": ["TBA"],
            },
        ]

        schedules = generate_schedules(courses, 20, "00:00", "23:59", [], [])
        self.assertEqual(schedules, [[1, 0]])

    def test_multi_meeting_section_renders_as_one_course(self):
        courses = bearplans.normalize_workday_courses([
            {
                "courseCode": "CSE 1310",
                "courseName": "Introduction to Computer Science",
                "sections": [
                    {
                        "section": "01",
                        "meetings": [
                            {"days": "Mon", "startTime": "9:00 AM", "endTime": "9:50 AM"},
                            {"days": "Wed", "startTime": "1:00 PM", "endTime": "1:50 PM"},
                        ],
                    }
                ],
            }
        ])
        schedules = generate_schedules(courses, 5, "00:00", "23:59", [], [])
        rendered = bearplans.build_renderable_schedules(courses, schedules)
        meeting_blocks = list(rendered["school"][0].values())

        self.assertEqual(len(meeting_blocks), 2)
        self.assertEqual({block["displayName"] for block in meeting_blocks}, {"Introduction to Computer Science"})
        self.assertEqual({block["subsection"] for block in meeting_blocks}, {"01"})

    def test_generate_api_returns_renderable_saved_schedule_page(self):
        payload = {
            "maxnumber": 50,
            "courses": [
                {
                    "courseCode": "CSE 1310",
                    "courseName": "Introduction to Computer Science",
                    "sections": [
                        {"section": "01", "academicPeriod": "Fall Half A 2025", "days": "Mon/Wed", "startTime": "9:00 AM", "endTime": "9:50 AM"},
                        {"section": "02", "academicPeriod": "Fall 2025", "days": "Tue/Thu", "startTime": "9:00 AM", "endTime": "9:50 AM"},
                    ],
                },
                {
                    "courseCode": "CHEM 2501",
                    "courseName": "Organic Chemistry I",
                    "sections": [
                        {"section": "01", "academicPeriod": "Fall 2025", "days": "Mon/Wed", "startTime": "1:00 PM", "endTime": "2:20 PM"},
                        {"section": "02", "academicPeriod": "Fall 2025", "days": "Tue/Thu", "startTime": "1:00 PM", "endTime": "2:20 PM"},
                    ],
                },
            ],
        }

        response = self.client.post("/api/workday/generate", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["courseCount"], 2)
        self.assertEqual(data["scheduleCount"], 4)

        result_page = self.client.get(data["redirect"])
        self.assertEqual(result_page.status_code, 200)
        html = result_page.get_data(as_text=True)
        self.assertIn("Introduction to Computer Science", html)
        self.assertIn("Organic Chemistry I", html)
        self.assertIn(">Save</button>", html)
        self.assertIn(">Home</a>", html)
        self.assertIn('"academicPeriod": "Fall 2025"', html)

    def test_closed_sections_are_rejected_server_side(self):
        courses = bearplans.normalize_workday_courses([
            {
                "courseCode": "CSE 1310",
                "courseName": "Introduction to Computer Science",
                "sections": [
                    {"section": "01", "status": "Closed", "days": "Mon", "startTime": "9 AM", "endTime": "10 AM"},
                    {"section": "02", "status": "Open", "days": "Tue", "startTime": "9 AM", "endTime": "10 AM"},
                ],
            }
        ])
        self.assertEqual(courses[0]["subsection"], ["02"])


if __name__ == "__main__":
    unittest.main()
