// --- Reusable Flatpickr Date Picker Module ---

export function setupCustomDatePickers() {
    const startInput = document.getElementById('records-date-start');
    const endInput = document.getElementById('records-date-end');

    if (!startInput || !endInput || typeof flatpickr === 'undefined') return;

    const startPicker = flatpickr(startInput, {
        dateFormat: "Y-m-d",
        allowInput: false,
        disableMobile: true,
        onChange: function(selectedDates, dateStr, instance) {
            endPicker.set('minDate', dateStr || null);
            startInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    const endPicker = flatpickr(endInput, {
        dateFormat: "Y-m-d",
        allowInput: false,
        disableMobile: true,
        onChange: function(selectedDates, dateStr, instance) {
            startPicker.set('maxDate', dateStr || null);
            endInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}
