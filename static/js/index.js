/* ===========================================
   BearPlans - Main JavaScript
   =========================================== */

// --- Global Variables ---
let maxnumberToSend = 10;
let selectedItems = [];
let selectedSchool = 'washu';
let tomSelectInstance = null;

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', function() {
    initSchoolPicker();
    initToggleSwitches();
    initDropdownHandler();
});

// --- School Selection ---
function initSchoolPicker() {
    document.querySelectorAll('.school-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.school-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedSchool = card.getAttribute('data-value');
            document.getElementById('nextBtnSchool').disabled = false;
        });
    });
}

function proceedToCoursesSection() {

    // Show loading state
    const btn = document.getElementById('nextBtnSchool');
    btn.disabled = true;
    btn.textContent = 'Loading...';

    // Fetch courses for selected school
    fetch('/get_courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school: selectedSchool })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert('Error loading courses: ' + data.error);
            btn.disabled = false;
            btn.textContent = 'Next →';
            return;
        }

        // Initialize Tom Select with courses
        initTomSelect(data.courses);

        // Show section 1
        showNextSection(1);

        // Reset button
        btn.disabled = false;
        btn.textContent = 'Next →';
    })
    .catch(err => {
        alert('Error loading courses: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Next →';
    });
}

// --- Section Navigation ---
function showNextSection(sectionNumber) {
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById('section' + sectionNumber).style.display = 'block';

    if (sectionNumber === 2) {
        loadProfessorFilters();
    }
}

// --- Tom Select Initialization ---
function initTomSelect(courseList) {
    // Destroy existing instance if it exists
    if (tomSelectInstance) {
        tomSelectInstance.destroy();
    }

    tomSelectInstance = new TomSelect("#dropdownMenu", {
        create: false,
        sortField: { field: "text", direction: "asc" }
    });

    if (courseList && courseList.length > 0) {
        const sortedCourses = [...courseList].sort();
        tomSelectInstance.clearOptions();
        sortedCourses.forEach(option => {
            tomSelectInstance.addOption({ value: option, text: option });
        });
        tomSelectInstance.refreshOptions();
    }
}

// --- Toggle Switch Styling ---
function initToggleSwitches() {
    document.querySelectorAll('input[type=checkbox]').forEach(switchElem => {
        switchElem.addEventListener('change', function() {
            const slider = this.nextElementSibling;
            if (slider && slider.firstElementChild) {
                if (this.checked) {
                    slider.firstElementChild.style.transform = 'translateX(26px)';
                    slider.style.backgroundColor = 'pink';
                } else {
                    slider.firstElementChild.style.transform = 'translateX(0)';
                    slider.style.backgroundColor = '#ccc';
                }
            }
        });
    });
}

// --- Dropdown Course Selection ---
function initDropdownHandler() {
    const dropdownMenu = document.getElementById('dropdownMenu');
    if (dropdownMenu) {
        dropdownMenu.addEventListener('change', function() {
            const selectedItem = dropdownMenu.value;
            if (selectedItem) {
                if (addItemToTable(selectedItem)) {
                    addItemToList(selectedItem);
                }
                dropdownMenu.value = '';
            }
        });
    }
}

// --- Table Management ---
function addItemToTable(item) {
    if (getCurrentCourseList().includes(item)) {
        return false;
    }

    const itemTable = document.getElementById('itemTable').getElementsByTagName('tbody')[0];
    const row = itemTable.insertRow();
    const cell1 = row.insertCell(0);
    const cell2 = row.insertCell(1);

    cell1.textContent = item;
    cell2.innerHTML = '<span class="delete-btn">Delete</span>';

    cell2.querySelector('.delete-btn').addEventListener('click', function() {
        itemTable.deleteRow(row.rowIndex - 1);
        removeItemFromList(item);
    });

    return true;
}

function addItemToList(item) {
    const itemList = document.getElementById('itemList');
    const listItem = document.createElement('li');
    listItem.textContent = item;
    itemList.appendChild(listItem);
}

function removeItemFromList(item) {
    const itemList = document.getElementById('itemList');
    const items = itemList.getElementsByTagName('li');
    for (let i = 0; i < items.length; i++) {
        if (items[i].textContent === item) {
            itemList.removeChild(items[i]);
            break;
        }
    }
}

// --- Max Schedule Number ---
function changeMaxNumberToSend(num) {
    maxnumberToSend = num;
}

// --- Professor Filters ---
function loadProfessorFilters() {
    const items = document.querySelectorAll("#itemList li");
    const selectedCourses = Array.from(items).map(i => i.textContent.trim());

    fetch('/get_professors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedCourses })
    })
    .then(res => res.json())
    .then(courseProfessors => {
        const container = document.getElementById('professorFilters');
        container.innerHTML = '';

        Object.entries(courseProfessors).forEach(([course, professors]) => {
            const section = document.createElement('div');
            section.className = 'professor-course';
            section.dataset.course = course;
            section.dataset.hasProfessors = professors.length > 0 ? 'true' : 'false';

            const header = document.createElement('div');
            header.className = 'professor-course-header';

            const title = document.createElement('strong');
            title.textContent = course;
            header.appendChild(title);

            if (professors.length > 0) {
                const actions = document.createElement('div');
                actions.className = 'professor-actions';

                const selectAll = document.createElement('button');
                selectAll.type = 'button';
                selectAll.textContent = 'Select all';
                selectAll.onclick = () => section.querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = true);

                const clearAll = document.createElement('button');
                clearAll.type = 'button';
                clearAll.textContent = 'Clear';
                clearAll.onclick = () => section.querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = false);

                actions.appendChild(selectAll);
                actions.appendChild(clearAll);
                header.appendChild(actions);
            }

            section.appendChild(header);

            if (professors.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'professor-empty';
                empty.textContent = 'No instructor listed yet. All sections will stay eligible.';
                section.appendChild(empty);
                container.appendChild(section);
                return;
            }

            const list = document.createElement('ul');
            list.className = 'professor-list';

            professors.forEach(professor => {
                const item = document.createElement('li');
                const label = document.createElement('label');

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.name = `profFilter[${course}]`;
                checkbox.value = professor;
                checkbox.checked = true;

                const link = document.createElement('a');
                link.href = `https://www.google.com/search?q=${encodeURIComponent(professor + ' WashU site:ratemyprofessors.com')}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = professor;

                label.appendChild(checkbox);
                label.appendChild(link);
                item.appendChild(label);
                list.appendChild(item);
            });

            section.appendChild(list);
            container.appendChild(section);
        });
    });
}

// --- Time Range Management ---
function addTimeRange() {
    const container = document.getElementById("timeRangesContainer");
    const newRange = document.createElement("li");
    newRange.style.cssText = "margin-bottom: 8px; display: flex; align-items: center; gap: 8px;";
    newRange.innerHTML = `
        <input name="timeStart[]" type="time" class="time-range-input">
        <span style="font-size: 14px;">-</span>
        <input name="timeEnd[]" type="time" class="time-range-input">
    `;
    container.appendChild(newRange);
}

function removeLastTimeRange() {
    const container = document.getElementById("timeRangesContainer");
    if (container.children.length > 0) {
        container.removeChild(container.lastElementChild);
    }
}

// --- Course List Save/Load ---
function getCurrentCourseList() {
    const rows = document.querySelectorAll("#itemTable tbody tr");
    return Array.from(rows).map(row => row.querySelector("td")?.innerText).filter(Boolean);
}

function saveCourseList() {
    const items = getCurrentCourseList();
    if (items.length === 0) {
        alert("Please add courses.");
        return;
    }

    const name = prompt("Enter a name for this course list:");
    if (!name) return;

    const saved = JSON.parse(localStorage.getItem("savedCourseLists") || "{}");
    saved[name] = items;
    localStorage.setItem("savedCourseLists", JSON.stringify(saved));
}

function loadCourseList() {
    const saved = JSON.parse(localStorage.getItem("savedCourseLists") || "{}");
    const container = document.getElementById("savedListContainer");
    container.innerHTML = "";

    if (Object.keys(saved).length === 0) {
        container.innerHTML = "<p style='font-style: italic; color: var(--muted);'>No saved lists.</p>";
    } else {
        Object.entries(saved).forEach(([name, courseList]) => {
            container.appendChild(createSavedListItem(name, courseList, saved));
        });
    }

    document.getElementById("loadPopup").style.display = "block";
}

function createSavedListItem(name, courseList, savedRef) {
    const row = document.createElement("div");
    row.className = "saved-list-item";

    // Header with name and buttons
    const topRow = document.createElement("div");
    topRow.className = "saved-list-item-header";

    const nameSpan = document.createElement("div");
    nameSpan.textContent = name;
    nameSpan.className = "saved-list-item-name";

    const buttonGroup = document.createElement("div");
    buttonGroup.className = "button-group";

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.className = "btn-outline";
    loadBtn.style.marginRight = "0";
    loadBtn.onclick = () => {
        loadNamedCourseList(name);
        closeLoadPopup();
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "btn-primary";
    deleteBtn.style.padding = "6px 14px";
    deleteBtn.style.fontSize = "14px";
    deleteBtn.onclick = () => {
        if (confirm(`Delete "${name}"?`)) {
            delete savedRef[name];
            localStorage.setItem("savedCourseLists", JSON.stringify(savedRef));
            loadCourseList();
        }
    };

    buttonGroup.appendChild(loadBtn);
    buttonGroup.appendChild(deleteBtn);
    topRow.appendChild(nameSpan);
    topRow.appendChild(buttonGroup);

    // Course preview
    const preview = document.createElement("div");
    preview.textContent = courseList.join(", ");
    preview.className = "saved-list-item-preview";

    row.appendChild(topRow);
    row.appendChild(preview);
    return row;
}

function closeLoadPopup() {
    document.getElementById("loadPopup").style.display = "none";
}

function loadNamedCourseList(name) {
    const saved = JSON.parse(localStorage.getItem("savedCourseLists") || "{}");
    const courseList = saved[name];
    if (!courseList) return;

    // Clear existing
    document.querySelector("#itemTable tbody").innerHTML = "";
    const itemList = document.getElementById("itemList");
    if (itemList) itemList.innerHTML = "";
    selectedItems = [];

    // Load courses
    courseList.forEach(item => {
        if (addItemToTable(item) && itemList) {
            selectedItems.push(item);
            const li = document.createElement("li");
            li.textContent = item;
            itemList.appendChild(li);
        }
    });
}

// --- Saved Generated Schedules ---
function readSavedSchedules() {
    try {
        const saved = JSON.parse(localStorage.getItem("savedSchedules") || "{}");
        return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch (err) {
        console.error("Could not read saved schedules:", err);
        return {};
    }
}

function normalizeSavedScheduleEntry(entry) {
    if (!entry) return [];
    if (Array.isArray(entry)) return entry;
    if (Array.isArray(entry.schedules)) return entry.schedules;
    if (typeof entry === "object") return [entry];
    return [];
}

function summarizeSavedScheduleEntry(entry) {
    const schedules = normalizeSavedScheduleEntry(entry);
    const firstSchedule = schedules[0] || {};
    const courseEntries = Object.entries(firstSchedule);
    const courseNames = [...new Set(courseEntries.map(([key, course]) => course?.displayName || key))];
    const courseIds = new Set(courseEntries.map(([key, course]) =>
        `${course?.code || ""}|${course?.subsection || ""}|${course?.displayName || key}`
    ));
    const preview = courseNames.slice(0, 4).join(", ");
    const extra = courseNames.length > 4 ? ` +${courseNames.length - 4}` : "";
    const countText = schedules.length > 1 ? `${schedules.length} schedules` : `${courseIds.size} courses`;
    const savedDate = entry?.createdAt ? `Saved ${new Date(entry.createdAt).toLocaleDateString()}` : "Saved locally";
    return `${countText} • ${preview || "No course names"}${extra} • ${savedDate}`;
}

function viewSavedSchedules() {
    const saved = readSavedSchedules();
    const container = document.getElementById("savedScheduleContainer");
    container.innerHTML = "";

    const entries = Object.entries(saved);
    if (entries.length === 0) {
        container.innerHTML = "<p style='font-style: italic; color: var(--muted);'>No saved schedules yet.</p>";
    } else {
        entries
            .sort(([, a], [, b]) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))
            .forEach(([name, entry]) => {
                container.appendChild(createSavedScheduleItem(name, entry, saved));
            });
    }

    document.getElementById("savedSchedulesPopup").style.display = "block";
}

function createSavedScheduleItem(name, entry, savedRef) {
    const row = document.createElement("div");
    row.className = "saved-list-item";

    const topRow = document.createElement("div");
    topRow.className = "saved-list-item-header";

    const nameSpan = document.createElement("div");
    nameSpan.textContent = name;
    nameSpan.className = "saved-list-item-name";

    const buttonGroup = document.createElement("div");
    buttonGroup.className = "button-group";

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.className = "btn-outline";
    loadBtn.style.marginRight = "0";
    loadBtn.onclick = () => loadSavedSchedule(name);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "btn-primary";
    deleteBtn.style.padding = "6px 14px";
    deleteBtn.style.fontSize = "14px";
    deleteBtn.onclick = () => {
        if (confirm(`Delete "${name}"?`)) {
            delete savedRef[name];
            localStorage.setItem("savedSchedules", JSON.stringify(savedRef));
            viewSavedSchedules();
        }
    };

    buttonGroup.appendChild(loadBtn);
    buttonGroup.appendChild(deleteBtn);
    topRow.appendChild(nameSpan);
    topRow.appendChild(buttonGroup);

    const preview = document.createElement("div");
    preview.textContent = summarizeSavedScheduleEntry(entry);
    preview.className = "saved-list-item-preview";

    row.appendChild(topRow);
    row.appendChild(preview);
    return row;
}

function closeSavedSchedulesPopup() {
    document.getElementById("savedSchedulesPopup").style.display = "none";
}

function loadSavedSchedule(name) {
    const saved = readSavedSchedules();
    const schedules = normalizeSavedScheduleEntry(saved[name]);

    if (schedules.length === 0) {
        alert("This saved schedule is empty.");
        return;
    }

    fetch('/set_matched_schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            matchedSchedule: schedules,
            overlappingCourses: [],
            friendMatchedSchedule: 0,
            source: "saved"
        })
    })
    .then(res => res.json())
    .then(response => {
        if (response.status === "ok") {
            window.location.href = "/render_timetable_check";
        } else {
            alert("Failed to load saved schedule.");
        }
    })
    .catch(err => {
        alert("Network error: " + err.message);
    });
}

// --- Shared Schedules ---
function viewSharedSchedules() {
    const code = localStorage.getItem("myScheduleCode");

    if (!code) {
        alert("❌ No saved schedule code found for this device.");
        return;
    }

    fetch(`/get_shared_schedule2/${code}`)
        .then(res => res.json())
        .then(data => {
            if (data.schedules && Array.isArray(data.schedules)) {
                fetch('/set_matched_schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        matchedSchedule: data.schedules,
                        overlappingCourses: [],
                        friendMatchedSchedule: 0,
                        source: "shared"
                    })
                })
                .then(res => res.json())
                .then(response => {
                    if (response.status === "ok") {
                        window.location.href = "/render_timetable_check";
                    } else {
                        alert("❌ Failed to prepare timetable.");
                    }
                });
            } else if (data.error) {
                alert("❌ Error from server: " + data.error);
            } else {
                alert("❌ Unexpected response format:\n" + JSON.stringify(data));
            }
        })
        .catch(err => {
            alert("❌ Network error: " + err.message);
        });
}

// --- Main Data Submission ---
function sendData() {
    if (!selectedSchool) {
        alert('Please select a school first.');
        return;
    }

    const generateBtn = document.getElementById('generateScheduleBtn');
    const originalButtonText = generateBtn ? generateBtn.textContent : '';
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
    }

    const noPreferenceBefore = document.getElementById('noPreferenceBefore').checked;
    const noPreferenceAfter = document.getElementById('noPreferenceAfter').checked;

    const noClassBefore = noPreferenceBefore ? document.getElementById('noClassBefore').value : "00:00";
    const noClassAfter = noPreferenceAfter ? document.getElementById('noClassAfter').value : "23:59";

    // Collect professor preferences
    const professorPrefs = {};
    document.querySelectorAll('#professorFilters .professor-course[data-has-professors="true"]').forEach(section => {
        professorPrefs[section.dataset.course] = [];
    });

    document.querySelectorAll('#professorFilters input[type="checkbox"]').forEach(input => {
        const courseMatch = input.name.match(/profFilter\[(.*?)\]/);
        if (courseMatch && input.checked) {
            const course = courseMatch[1];
            if (!professorPrefs[course]) professorPrefs[course] = [];
            professorPrefs[course].push(input.value);
        }
    });

    // Collect time ranges
    const timeStart = Array.from(document.querySelectorAll('input[name="timeStart[]"]'))
        .map(input => input.value || 'None');
    const timeEnd = Array.from(document.querySelectorAll('input[name="timeEnd[]"]'))
        .map(input => input.value || 'None');

    // Collect selected courses
    const items = document.querySelectorAll("#itemList li");
    const itemsToSend = Array.from(items).map(item => item.textContent.trim());

    if (itemsToSend.length === 0) {
        alert('Please add at least one course.');
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = originalButtonText;
        }
        return;
    }

    // Submit
    fetch('/process_items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            school: selectedSchool,
            items: itemsToSend,
            maxnumber: maxnumberToSend,
            noClassAfter: noClassAfter,
            noClassBefore: noClassBefore,
            timeStart: timeStart,
            timeEnd: timeEnd,
            showDistance: false,
            preferredProfs: professorPrefs,
        })
    })
    .then(response => {
        if (response.redirected) {
            window.location.href = response.url;
        } else {
            console.error('Unexpected response:', response);
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = originalButtonText;
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = originalButtonText;
        }
    });
}
