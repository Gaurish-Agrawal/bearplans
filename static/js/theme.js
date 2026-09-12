(function() {
    const STORAGE_KEY = "bearPlansTheme";
    const root = document.documentElement;

    function readTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
        } catch (err) {
            return root.dataset.theme === "dark" ? "dark" : "light";
        }
    }

    function writeTheme(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (err) {
            // Theme persistence is optional if storage is unavailable.
        }
    }

    function applyTheme(theme) {
        root.dataset.theme = theme;

        document.querySelectorAll("[data-theme-toggle]").forEach(button => {
            const isDark = theme === "dark";
            button.setAttribute("aria-pressed", isDark ? "true" : "false");
            button.querySelector("[data-theme-label]").textContent =
                isDark ? "Switch to light mode" : "Switch to dark mode";
            button.hidden = false;
        });
    }

    function toggleTheme() {
        // Use the displayed theme so toggling works even when storage is blocked.
        const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
        writeTheme(nextTheme);
        applyTheme(nextTheme);
    }

    function initThemeControls() {
        applyTheme(root.dataset.theme);
        document.querySelectorAll("[data-theme-toggle]").forEach(button => {
            button.addEventListener("click", toggleTheme);
        });
    }

    // Loaded synchronously in the head, before the first page paint.
    applyTheme(readTheme());

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThemeControls, { once: true });
    } else {
        initThemeControls();
    }
    window.addEventListener("storage", event => {
        if (event.key === STORAGE_KEY || event.key === null) applyTheme(readTheme());
    });
    window.addEventListener("pageshow", () => applyTheme(readTheme()));
})();
