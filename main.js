class StepSequencer {
    constructor() {
        this.instruments = ["hh", "oh", "sd", "bd"];
        this.availableInstruments = {
            "bd": "Bass Drum",
            "sd": "Snare Drum",
            "hh": "Hi-Hat",
            "oh": "Open Hi-Hat",
            "rd": "Ride",
            "lt": "Low Tom",
            "mt": "Mid Tom",    
            "ht": "High Tom",
            "cr": "Crash",
            "cp": "Clap"
        };
        this.container = document.getElementById('container');
        this.addButtonContainer = document.getElementById('add-instrument-container');
        this.bpm = 60;
        this.bank = "RolandTR909";
        this.availableBanks = [];
        this.measure = 4; // 4/4 time signature (default)
        this.stepsPerBeat = 4; // 4 steps per beat
        this.stepsPerCycle = this.measure * this.stepsPerBeat; // 16 steps for 4/4, 12 for 3/4
        this.startTime = null;
        this.highlightInterval = null;
        this.isPlaying = false;
        this.patternStack = null;
    }
    
    async loadBanks() {
        try {
            const ds = "https://raw.githubusercontent.com/felixroos/dough-samples/main/";
            const response = await fetch(`${ds}/tidal-drum-machines.json`);
            const data = await response.json();
            
            // Extract unique bank names from sample keys
            // Sample keys are formatted like "RolandTR909_bd", "RolandTR909_sd", etc.
            const banks = new Set();
            
            if (data && typeof data === 'object') {
                if (Array.isArray(data)) {
                    // If it's an array, extract bank names from each item
                    data.forEach(item => {
                        if (item && typeof item === 'object') {
                            // Check if item has a key or name property with bank_sample format
                            Object.keys(item).forEach(key => {
                                if (key.includes('_')) {
                                    const bankName = key.split('_')[0];
                                    banks.add(bankName);
                                }
                            });
                            // Also check nested structures
                            Object.values(item).forEach(val => {
                                if (typeof val === 'string' && val.includes('_')) {
                                    const bankName = val.split('_')[0];
                                    banks.add(bankName);
                                }
                            });
                        } else if (typeof item === 'string' && item.includes('_')) {
                            const bankName = item.split('_')[0];
                            banks.add(bankName);
                        }
                    });
                } else {
                    // If it's an object, extract bank names from keys
                    Object.keys(data).forEach(key => {
                        if (key.includes('_')) {
                            // Split by underscore and take the first part (bank name)
                            const bankName = key.split('_')[0];
                            banks.add(bankName);
                        } else {
                            // If key doesn't have underscore, it might be a bank name itself
                            // Check if the value contains samples with bank_sample format
                            const value = data[key];
                            if (typeof value === 'object' && value !== null) {
                                Object.keys(value).forEach(subKey => {
                                    if (subKey.includes('_')) {
                                        const bankName = subKey.split('_')[0];
                                        banks.add(bankName);
                                    }
                                });
                            }
                        }
                    });
                }
            }
            
            // Convert Set to sorted array
            this.availableBanks = Array.from(banks).sort();
            
            // Fallback to common drum machine banks if still empty
            if (this.availableBanks.length === 0) {
                this.availableBanks = [
                    "RolandTR909",
                    "RolandTR808",
                    "RolandTR606",
                    "RolandCR78",
                    "LinnDrum",
                    "OberheimDMX",
                    "YamahaRX5"
                ];
            }
            
            // Ensure default bank is in the list
            if (!this.availableBanks.includes(this.bank)) {
                this.bank = this.availableBanks[0] || "RolandTR909";
            }
            
            // Setup bank selector
            this.setupBankSelector();
        } catch (error) {
            console.error('Error loading banks:', error);
            // Fallback to common banks
            this.availableBanks = [
                "RolandTR909",
                "RolandTR808",
                "RolandTR606",
                "RolandCR78",
                "LinnDrum",
                "OberheimDMX",
                "YamahaRX5"
            ];
            this.setupBankSelector();
        }
    }
    
    setupBankSelector() {
        const bankSelect = document.getElementById('bank-select');
        if (!bankSelect) return;
        
        bankSelect.innerHTML = '';
        this.availableBanks.forEach(bank => {
            const option = document.createElement('option');
            option.value = bank;
            option.textContent = bank;
            if (bank === this.bank) {
                option.selected = true;
            }
            bankSelect.appendChild(option);
        });
    }
    
    updateBank(newBank) {
        this.bank = newBank;
        if (this.isPlaying) {
            this.play();
        }
    }

    getStepDurationMs() {
        const cycleDurationMs = this.measure * (60 / this.bpm) * 1000;
        let divisor = 2;
        if (this.measure === 3) {
            divisor = 1.5;
        }
        
        return (cycleDurationMs / this.stepsPerCycle) / divisor;
    }

    init() {
        // Setup add instrument button first (so addButtonContainer exists)
        this.setupAddInstrumentButton();
        
        // Render initial instruments
        this.instruments.forEach(instrument => {
            this.addInstrumentRow(instrument);
        });
    }
    
    addInstrumentRow(instrument) {
        const instrumentRow = document.createElement('div');
        instrumentRow.classList.add('instrument-row', instrument);
        instrumentRow.dataset.instrument = instrument;
        
        // Instrument label column with remove button
        const labelContainer = document.createElement('div');
        labelContainer.classList.add('instrument-label-container');
        
        const instrumentLabel = document.createElement('div');
        instrumentLabel.classList.add('instrument-label');
        instrumentLabel.textContent = this.availableInstruments[instrument] || instrument;
        
        const removeButton = document.createElement('button');
        removeButton.classList.add('remove-instrument');
        removeButton.innerHTML = '×';
        removeButton.setAttribute('aria-label', 'Remove instrument');
        removeButton.addEventListener('click', () => this.removeInstrument(instrument));
        
        labelContainer.appendChild(instrumentLabel);
        labelContainer.appendChild(removeButton);
        
        // Steps column
        const stepContainer = document.createElement('div');
        stepContainer.classList.add('step-container');
        
        for (let i = 0; i < this.stepsPerCycle; i++) {
            const step = document.createElement('div');
            step.classList.add('step', `step-${i}`);
            // Add beat marker class for visual grouping (every 4th step)
            if (i % this.stepsPerBeat === 0) {
                step.classList.add('beat-marker');
            }
            step.addEventListener('click', () => this.toggleStep(instrument, i));
            stepContainer.appendChild(step);
        }
        
        instrumentRow.appendChild(labelContainer);
        instrumentRow.appendChild(stepContainer);
        
        // Insert before the add button container
        this.container.insertBefore(instrumentRow, this.addButtonContainer);
    }
    
    removeInstrument(instrument) {
        // Remove from instruments array
        this.instruments = this.instruments.filter(inst => inst !== instrument);
        
        // Remove the DOM element
        const instrumentRow = this.container.querySelector(`div.instrument-row.${instrument}`);
        if (instrumentRow) {
            instrumentRow.remove();
        }
        
        // If playing, restart with updated instruments
        if (this.isPlaying) {
            this.play();
        }
        
        // Update add button dropdown
        this.updateAddButtonDropdown();
    }
    
    addInstrument(instrument) {
        if (!this.instruments.includes(instrument)) {
            this.instruments.push(instrument);
            this.addInstrumentRow(instrument);
            this.updateAddButtonDropdown();
            
            // If playing, restart with new instrument
            if (this.isPlaying) {
                this.play();
            }
        }
    }
    
    getAvailableInstrumentsToAdd() {
        return Object.keys(this.availableInstruments).filter(
            inst => !this.instruments.includes(inst)
        );
    }
    
    setupAddInstrumentButton() {
        const addButton = document.createElement('button');
        addButton.id = 'add-instrument-btn';
        addButton.classList.add('add-instrument-btn');
        addButton.innerHTML = '+';
        addButton.setAttribute('aria-label', 'Add instrument');
        
        const dropdown = document.createElement('div');
        dropdown.id = 'instrument-dropdown';
        dropdown.classList.add('instrument-dropdown');
        dropdown.style.display = 'none';
        
        addButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display !== 'none';
            dropdown.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                this.updateAddButtonDropdown();
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!addButton.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        
        this.addButtonContainer.appendChild(addButton);
        this.addButtonContainer.appendChild(dropdown);
        this.updateAddButtonDropdown();
    }
    
    updateAddButtonDropdown() {
        const dropdown = document.getElementById('instrument-dropdown');
        dropdown.innerHTML = '';
        
        const available = this.getAvailableInstrumentsToAdd();
        
        if (available.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.classList.add('dropdown-item', 'dropdown-empty');
            emptyMsg.textContent = 'All instruments added';
            dropdown.appendChild(emptyMsg);
        } else {
            available.forEach(instrument => {
                const item = document.createElement('div');
                item.classList.add('dropdown-item');
                item.textContent = this.availableInstruments[instrument];
                item.addEventListener('click', () => {
                    this.addInstrument(instrument);
                    dropdown.style.display = 'none';
                });
                dropdown.appendChild(item);
            });
        }
    }

    toggleStep(instrument, step) {
        const stepElement = this.container.querySelector(`div.instrument-row.${instrument} div.step.step-${step}`);
        stepElement.classList.toggle('active');
    }

    play() {
        hush();
        
        const patterns = this.instruments.map(instrument => {
            const steps = this.container.querySelectorAll(`div.instrument-row.${instrument} div.step`);
            const activeBeats = Array.from(steps)
                .map((step, i) => step.classList.contains('active') ? i : null)
                .filter(beat => beat !== null)
                .join(',');
            console.log(activeBeats);
            console.log(this.stepsPerCycle);
            return s(instrument).beat(activeBeats || '-', this.stepsPerCycle).bank(this.bank).cpm(this.bpm);
        });

        this.patternStack = stack(...patterns);
        this.patternStack.play();
        
        this.isPlaying = true;
        this.startHighlight();
    }
    
    updateCpm(newCpm) {
        this.bpm = newCpm;
        if (this.isPlaying) {
            this.play();
        }
    }
    
    updateMeasure(newMeasure) {
        this.measure = parseInt(newMeasure);
        this.stepsPerCycle = this.measure * this.stepsPerBeat;
        
        // Regenerate all instrument rows with new step count
        this.regenerateInstrumentRows();
        
        if (this.isPlaying) {
            this.play();
        }
    }
    
    regenerateInstrumentRows() {
        // Store current active steps
        const activeSteps = {};
        this.instruments.forEach(instrument => {
            const steps = this.container.querySelectorAll(`div.instrument-row.${instrument} div.step`);
            activeSteps[instrument] = [];
            steps.forEach((step, i) => {
                if (step.classList.contains('active')) {
                    activeSteps[instrument].push(i);
                }
            });
        });
        
        // Clear container (except add button)
        const instrumentRows = this.container.querySelectorAll('.instrument-row');
        instrumentRows.forEach(row => row.remove());
        
        // Recreate all instrument rows
        this.instruments.forEach(instrument => {
            this.addInstrumentRow(instrument);
            
            // Restore active steps (only if they're within the new step count)
            if (activeSteps[instrument]) {
                activeSteps[instrument].forEach(stepIndex => {
                    if (stepIndex < this.stepsPerCycle) {
                        const stepElement = this.container.querySelector(
                            `div.instrument-row.${instrument} div.step.step-${stepIndex}`
                        );
                        if (stepElement) {
                            stepElement.classList.add('active');
                        }
                    }
                });
            }
        });
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
        // Clear all highlights if currentStep is invalid
        if (currentStep < 0) {
            this.instruments.forEach(instrument => {
                const steps = this.container.querySelectorAll(`div.instrument-row.${instrument} div.step`);
                steps.forEach((step) => {
                    step.classList.remove('current');
                });
            });
            return;
        }
        
        // Ensure currentStep is within valid range (0 to stepsPerCycle - 1)
        const validStep = currentStep % this.stepsPerCycle;
        
        this.instruments.forEach(instrument => {
            const steps = this.container.querySelectorAll(`div.instrument-row.${instrument} div.step`);
            steps.forEach((step, i) => {
                // Only highlight if the step index matches and is within the valid range
                step.classList.toggle('current', i === validStep && i < this.stepsPerCycle);
            });
        });
    }

    stop() {
        hush();
        this.isPlaying = false;
        this.patternStack = null;
        this.stopHighlight();
    }
}
