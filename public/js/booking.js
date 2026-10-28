(() => {
  const form = document.querySelector("#bookingForm");
  if (!form) return;

  const steps = [...form.querySelectorAll(".booking-step")];
  const progressSteps = [...document.querySelectorAll(".progress-step")];
  const doctorSelect = form.querySelector("#doctor");

  function showStep(stepNumber) {
    steps.forEach((step) => {
      const active = Number(step.dataset.step) === stepNumber;
      step.hidden = !active;
      step.classList.toggle("is-visible", active);
    });
    progressSteps.forEach((step, index) => {
      step.classList.toggle("is-active", index < stepNumber);
      step.classList.toggle("is-current", index + 1 === stepNumber);
    });
  }

  function updateDoctors() {
    const specialty = form.querySelector('input[name="specialty"]:checked')?.value;
    const availableOptions = [...doctorSelect.options].filter((option) => option.value);
    availableOptions.forEach((option) => {
      option.hidden = option.dataset.specialty !== specialty;
      option.disabled = option.hidden;
    });
    if (doctorSelect.selectedOptions[0]?.dataset.specialty !== specialty) {
      doctorSelect.value = "";
    }
  }

  function isStepValid(step) {
    for (const field of step.querySelectorAll("input, select")) {
      if (!field.checkValidity()) {
        field.reportValidity();
        field.focus();
        return false;
      }
    }
    return true;
  }

  form.addEventListener("change", (event) => {
    if (event.target.name === "specialty") updateDoctors();
  });

  form.addEventListener("click", (event) => {
    const nextButton = event.target.closest("[data-next]");
    const backButton = event.target.closest("[data-back]");
    if (!nextButton && !backButton) return;

    const currentStep = nextButton
      ? Number(nextButton.closest(".booking-step").dataset.step)
      : Number(backButton.closest(".booking-step").dataset.step);
    if (nextButton && !isStepValid(steps.find((step) => Number(step.dataset.step) === currentStep))) return;

    if (nextButton && currentStep === 1) updateDoctors();
    showStep(currentStep + (nextButton ? 1 : -1));
  });

  updateDoctors();
})();
