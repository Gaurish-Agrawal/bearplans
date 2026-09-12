# BearPlans Workday Importer Privacy Notice

Last updated: September 4, 2026

BearPlans Workday Importer does not collect or store Workday usernames, passwords, MFA codes, browsing history, or registration actions.

When a user explicitly clicks **Add course to BearPlans**, the extension reads the course name, course code, section identifiers, academic period, meeting days and times, instructor names, room or building information, and availability status for search results matching the selected course code. It may expand those matching result rows or automatically open their **View Course Section** windows when the meeting data is not available inline. It does not inspect unrelated search results. The optional Start Registration fallback can read the same fields from the currently open course's section list. This information is stored in Chrome extension storage on the user's device.

When the user clicks **Generate schedules**, the imported course and meeting information is sent to the BearPlans server selected in the extension's Connection settings. The information is used only to generate schedule combinations. The extension does not sell data, use it for advertising, or transmit it to unrelated services.

When the user chooses **Add to Workday** on a BearPlans schedule and confirms a name, the extension opens WashU Workday in a separate window. It derives the academic period from the imported course data, checks the selected course sections and meeting times, creates a new Workday saved schedule, and adds those exact sections to that new schedule. It stores the requested name, derived period, selected sections, the new schedule's Workday identifier, and task progress locally so an interrupted action is not silently repeated. Only the latest export task is retained. These details are sent only to the user's authenticated WashU Workday session, not an unrelated service.

The export uses Workday's saved-schedule forms only. It does not register for or drop courses, change existing registrations, or add courses to an existing saved schedule chosen by name. If authentication is needed, the user signs in through Workday normally; BearPlans never handles the password or MFA code. Closing or stopping an export does not delete a new schedule that has already been created, and an interrupted export may leave that new schedule partially filled.
