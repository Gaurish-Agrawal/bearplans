import io
import json
import unittest
import zipfile

import app as bearplans


class ExtensionSetupTests(unittest.TestCase):
    def setUp(self):
        self.previous = bearplans.app.config.get("CHROME_WEB_STORE_URL", "")
        bearplans.app.config.update(TESTING=True, CHROME_WEB_STORE_URL="")
        self.client = bearplans.app.test_client()

    def tearDown(self):
        bearplans.app.config["CHROME_WEB_STORE_URL"] = self.previous

    def test_home_keeps_scheduler_and_links_guide(self):
        html = self.client.get("/").get_data(as_text=True)
        for marker in ["proceedToCoursesSection()", "viewSavedSchedules()", 'id="section4"',
                       'href="/extension"', 'href="/privacy"', "Set up extension", "Preview release"]:
            self.assertIn(marker, html)
        self.assertNotIn(">Add to Chrome<", html)

    def test_preview_guide_and_privacy_are_public(self):
        guide = self.client.get("/extension")
        self.assertEqual(guide.status_code, 200)
        self.assertIn("not available yet", guide.get_data(as_text=True))
        self.assertIn("data-beta-install", guide.get_data(as_text=True))
        privacy = self.client.get("/privacy")
        self.assertEqual(privacy.status_code, 200)
        self.assertIn("bearplansofficial@gmail.com", privacy.get_data(as_text=True))
        self.assertIn("partly filled", privacy.get_data(as_text=True))

    def test_only_configured_store_listing_enables_install(self):
        url = "https://chromewebstore.google.com/detail/bearplans/" + "a" * 32
        bearplans.app.config["CHROME_WEB_STORE_URL"] = url
        for route in ["/", "/extension"]:
            html = self.client.get(route).get_data(as_text=True)
            self.assertIn(f'href="{url}"', html)
            self.assertIn(">Add to Chrome<", html)
            self.assertNotIn("data-beta-install", html)
            self.assertNotIn("Preview release", html)

    def test_install_link_rejects_unsafe_or_placeholder_urls(self):
        for value in ["javascript:alert(1)", "https://example.com/" + "a" * 32,
                      "https://chromewebstore.google.com.evil.test/detail/" + "a" * 32,
                      "https://chromewebstore.google.com/detail/YOUR_ID",
                      "https://chromewebstore.google.com/detail/" + "a" * 32 + "?next=evil",
                      'https://chromewebstore.google.com/detail/" onclick="alert(1)']:
            with self.subTest(value=value):
                bearplans.app.config["CHROME_WEB_STORE_URL"] = value
                self.assertIsNone(bearplans.extension_listing_url())

    def test_download_is_complete_extension_without_tests(self):
        response = self.client.get("/static/downloads/bearplans-workday-importer.zip")
        self.assertEqual(response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            names = set(archive.namelist())
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["manifest_version"], 3)
            for group in manifest["content_scripts"]:
                for filename in group.get("js", []) + group.get("css", []):
                    self.assertIn(filename, names)
            self.assertIn(manifest["background"]["service_worker"], names)
            self.assertTrue(all("test" not in name and "inspect" not in name for name in names))
        response.close()


if __name__ == "__main__":
    unittest.main()
