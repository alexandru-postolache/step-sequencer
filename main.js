class StepSequencer {
    constructor() {
        this.instruments = ["hh", "oh", "sd", "bd"];
        this.container = document.getElementById('container');
        this.bpm = 60;
        this.measure = 4;
        this.stepsPerCycle = 16;
        this.startTime = null;
        this.highlightInterval = null;
    }

    getStepDurationMs() {
        // Match Strudel: setcpm(bpm/measure) → CPM = bpm/measure, one cycle = 4 beats at bpm
        // Cycle duration = measure * (60/bpm) sec; 16 steps per cycle (÷2 to match actual beat)
        const cycleDurationMs = this.measure * (60 / this.bpm) * 1000;
        return (cycleDurationMs / this.stepsPerCycle) / 2;
    }

    init() {
        this.instruments.forEach(instrument => {
            const instrumentContainer = document.createElement('div');
            instrumentContainer.classList.add('instrument', instrument);
            instrumentContainer.appendChild(document.createElement('h3')).textContent = instrument;
            this.container.appendChild(instrumentContainer);

            for (let i = 0; i < 16; i++) {
                const step = document.createElement('div');
                step.classList.add('step', `step-${i}`);
                step.addEventListener('click', () => this.toggleStep(instrument, i));
                instrumentContainer.appendChild(step);
            }
        });

    }

    toggleStep(instrument, step) {
        const stepElement = this.container.querySelector(`div.instrument.${instrument} div.step.step-${step}`);
        stepElement.classList.toggle('active');
    }

    play() {
        const patterns = this.instruments.map(instrument => {
            const steps = this.container.querySelectorAll(`div.instrument.${instrument} div.step`);
            const activeBeats = Array.from(steps)
                .map((step, i) => step.classList.contains('active') ? i + 1 : null)
                .filter(Boolean)
                .join(',');
            return s(instrument).beat(activeBeats || '-1', 16).bank("RolandTR909").cpm(this.bpm);
        });


        
        let patternStack = stack(...patterns);
        patternStack.play();

        this.startHighlight();
    }

    startHighlight() {
        this.stopHighlight();
        this.startTime = performance.now();
        const stepDuration = this.getStepDurationMs();
        const tick = () => {
            const elapsed = performance.now() - this.startTime;
            const currentStep = Math.floor(elapsed / stepDuration) % this.stepsPerCycle;
            this.highlight(currentStep);
        };
        tick();
        this.highlightInterval = setInterval(tick, Math.min(stepDuration / 2, 50));
    }

    stopHighlight() {
        if (this.highlightInterval) {
            clearInterval(this.highlightInterval);
            this.highlightInterval = null;
        }
        this.startTime = null;
        this.highlight(-1);
    }

    highlight(currentStep) {
        this.instruments.forEach(instrument => {
            const steps = this.container.querySelectorAll(`div.instrument.${instrument} div.step`);
            steps.forEach((step, i) => {
                step.classList.toggle('current', i === currentStep);
            });
        });
    }

    stop() {
        hush();
        this.stopHighlight();
    }
}
