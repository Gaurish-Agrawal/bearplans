import unittest

import app as bearplans


class ThemeTemplateTests(unittest.TestCase):
    def setUp(self):
        self.client = bearplans.app.test_client()

    def assert_theme(self, html):
        self.assertEqual(html.count('src="/static/js/theme.js"'), 1)
        self.assertEqual(html.count('href="/static/css/theme.css"'), 1)
        self.assertEqual(html.count('data-theme-toggle'), 1)
        self.assertIn('aria-label="Dark mode"', html)
        self.assertLess(html.index('src="/static/js/theme.js"'), html.index('</head>'))
        self.assertNotIn('Dark mode archived', html)

    def test_public_pages_share_the_theme(self):
        for route in ['/', '/timeline', '/team', '/extension', '/privacy', '/render_no_timetable']:
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, 200)
                self.assert_theme(response.get_data(as_text=True))

    def test_every_timetable_variant_shares_the_theme(self):
        schedule = {'Test course': {
            'code': 'CSE 1310', 'subsection': '01', 'displayName': 'Test course',
            'days': 'M-W----', 'times': ['09:00'], 'timestring': '09:00AM-09:50AM',
            'boxcolor': '#FFEBEF', 'prof': 'Test Professor', 'building': 'Test Hall',
        }}
        for variant in ['generated', 'matched', 'shared', 'saved']:
            with self.subTest(variant=variant), bearplans.app.test_request_context('/'):
                html = bearplans.render_template(
                    'timetable.html', school=[schedule], displayDistances={1: [[] for _ in range(6)]},
                    matchedlist=variant == 'matched', sharedList=variant == 'shared',
                    savedList=variant == 'saved', friendMatchedSchedule=1,
                )
                self.assert_theme(html)
                self.assertIn('class="course-block course-shade-0', html)


if __name__ == '__main__':
    unittest.main()
