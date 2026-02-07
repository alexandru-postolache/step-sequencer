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
        // Track subdivisions per instrument and step: {instrument: {stepIndex: subdivision}}
        this.subdivisions = {};
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
        
        // Initialize subdivisions for this instrument if not exists
        if (!this.subdivisions[instrument]) {
            this.subdivisions[instrument] = {};
        }
        
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
            step.dataset.instrument = instrument;
            step.dataset.stepIndex = i;
            // Add beat marker class for visual grouping (every 4th step)
            if (i % this.stepsPerBeat === 0) {
                step.classList.add('beat-marker');
            }
            // Initialize subdivision if not set (default is 1, meaning no subdivision)
            if (!this.subdivisions[instrument][i]) {
                this.subdivisions[instrument][i] = 1;
            }
            this.updateStepSubdivisionVisual(step, this.subdivisions[instrument][i]);
            step.addEventListener('click', (e) => {
                if (e.button === 0) { // Left click
                    this.toggleStep(instrument, i);
                }
            });
            step.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showSubdivisionMenu(e, instrument, i);
            });
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
        
        // Remove subdivisions data
        delete this.subdivisions[instrument];
        
        // Remove the DOM element
        const instrumentRow = this.container.querySelector(`div.instrument-row.${instrument}`);
        if (instrumentRow) {
            instrumentRow.remove();
        }
        
        // Close any open subdivision menu
        this.closeSubdivisionMenu();
        
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
    
    showSubdivisionMenu(event, instrument, stepIndex) {
        // Close any existing menu
        this.closeSubdivisionMenu();
        
        const menu = document.createElement('div');
        menu.classList.add('subdivision-menu');
        menu.dataset.instrument = instrument;
        menu.dataset.stepIndex = stepIndex;
        
        const currentSubdivision = this.subdivisions[instrument][stepIndex] || 1;
        
        // Create "Subdivide" menu item with submenu
        const subdivideItem = document.createElement('div');
        subdivideItem.classList.add('subdivision-menu-item', 'has-submenu');
        subdivideItem.textContent = 'Subdivide';
        
        // Create submenu
        const submenu = document.createElement('div');
        submenu.classList.add('subdivision-submenu');
        
        const options = [2, 3, 4];
        options.forEach(subdiv => {
            const item = document.createElement('div');
            item.classList.add('subdivision-menu-item', 'submenu-item');
            if (subdiv === currentSubdivision) {
                item.classList.add('active');
            }
            item.textContent = `${subdiv} subdivisions`;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setSubdivision(instrument, stepIndex, subdiv);
                this.closeSubdivisionMenu();
            });
            submenu.appendChild(item);
        });
        
        // Show submenu on hover
        subdivideItem.addEventListener('mouseenter', () => {
            submenu.style.display = 'block';
        });
        
        // Keep submenu visible when hovering over it
        submenu.addEventListener('mouseenter', () => {
            submenu.style.display = 'block';
        });
        
        // Hide submenu when mouse leaves
        const hideSubmenu = () => {
            submenu.style.display = 'none';
        };
        subdivideItem.addEventListener('mouseleave', (e) => {
            // Only hide if not moving to submenu
            if (!submenu.contains(e.relatedTarget)) {
                hideSubmenu();
            }
        });
        submenu.addEventListener('mouseleave', (e) => {
            // Only hide if not moving back to parent item
            if (!subdivideItem.contains(e.relatedTarget)) {
                hideSubmenu();
            }
        });
        
        menu.appendChild(subdivideItem);
        menu.appendChild(submenu);
        
        document.body.appendChild(menu);
        
        // Position menu near the click
        const rect = event.target.getBoundingClientRect();
        menu.style.left = `${rect.left + rect.width / 2}px`;
        menu.style.top = `${rect.bottom + 5}px`;
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', this.closeSubdivisionMenu.bind(this), { once: true });
        }, 0);
    }
    
    closeSubdivisionMenu() {
        const menu = document.querySelector('.subdivision-menu');
        if (menu) {
            menu.remove();
        }
    }
    
    setSubdivision(instrument, stepIndex, subdivision) {
        if (!this.subdivisions[instrument]) {
            this.subdivisions[instrument] = {};
        }
        this.subdivisions[instrument][stepIndex] = subdivision;
        
        const stepElement = this.container.querySelector(
            `div.instrument-row.${instrument} div.step.step-${stepIndex}`
        );
        if (stepElement) {
            this.updateStepSubdivisionVisual(stepElement, subdivision);
        }
        
        // If playing, restart with updated subdivisions
        if (this.isPlaying) {
            this.play();
        }
    }
    
    updateStepSubdivisionVisual(stepElement, subdivision) {
        // Remove existing subdivision classes
        stepElement.classList.remove('subdivision-2', 'subdivision-3', 'subdivision-4');
        
        // Remove existing divider elements
        const existingDividers = stepElement.querySelectorAll('.subdiv-line');
        existingDividers.forEach(divider => divider.remove());
        
        // Add appropriate class
        if (subdivision > 1) {
            stepElement.classList.add(`subdivision-${subdivision}`);
            
            // For 4 subdivisions, we need to add extra divider elements (since ::before and ::after are used for 3)
            if (subdivision === 4) {
                const positions = [25, 50, 75];
                positions.forEach(pos => {
                    const divider = document.createElement('div');
                    divider.classList.add('subdiv-line');
                    divider.style.left = `${pos}%`;
                    stepElement.appendChild(divider);
                });
            }
        }
        
        // Update data attribute
        stepElement.dataset.subdivision = subdivision;
    }

    play() {
        hush();
        
        const patterns = this.instruments.map(instrument => {
            const steps = this.container.querySelectorAll(`div.instrument-row.${instrument} div.step`);
            const beatPattern = this.buildBeatPattern(instrument, steps);
            console.log(`${instrument} pattern:`, beatPattern);
            console.log(this.stepsPerCycle);
            return s(instrument).beat(beatPattern || '-', this.stepsPerCycle).bank(this.bank).cpm(this.bpm);
        });

        this.patternStack = stack(...patterns);
        this.patternStack.play();
        
        this.isPlaying = true;
        this.startHighlight();
    }
    
    buildBeatPattern(instrument, steps) {
        const patternParts = [];
        
        Array.from(steps).forEach((step, i) => {
            const isActive = step.classList.contains('active');
            const subdivision = this.subdivisions[instrument]?.[i] || 1;
            
            if (isActive) {
                if (subdivision === 1) {
                    // No subdivision, just the step number
                    patternParts.push(i);
                } else {
                    // Create subdivision pattern with fractional beats
                    // For subdivision N, divide the step into N parts
                    const subdivBeats = Array.from({ length: subdivision }, (_, idx) => {
                        return i + (idx / subdivision);
                    });
                    // Add fractional beats directly without brackets
                    subdivBeats.forEach(beat => patternParts.push(beat));
                }
            }
        });
        
        return patternParts.length > 0 ? patternParts.join(',') : null;
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
        // Store current active steps and subdivisions
        const activeSteps = {};
        const storedSubdivisions = {};
        this.instruments.forEach(instrument => {
            const steps = this.container.querySelectorAll(`div.instrument-row.${instrument} div.step`);
            activeSteps[instrument] = [];
            storedSubdivisions[instrument] = {};
            steps.forEach((step, i) => {
                if (step.classList.contains('active')) {
                    activeSteps[instrument].push(i);
                }
                // Store subdivision
                const subdivision = this.subdivisions[instrument]?.[i] || 1;
                if (i < this.stepsPerCycle) {
                    storedSubdivisions[instrument][i] = subdivision;
                }
            });
        });
        
        // Clear container (except add button)
        const instrumentRows = this.container.querySelectorAll('.instrument-row');
        instrumentRows.forEach(row => row.remove());
        
        // Close any open subdivision menu
        this.closeSubdivisionMenu();
        
        // Recreate all instrument rows
        this.instruments.forEach(instrument => {
            // Restore subdivisions before creating row
            if (!this.subdivisions[instrument]) {
                this.subdivisions[instrument] = {};
            }
            Object.assign(this.subdivisions[instrument], storedSubdivisions[instrument]);
            
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
