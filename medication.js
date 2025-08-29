const DRUGBANK_CONFIG = {
  baseURL: 'https://api.drugbank.com/v1',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
};

class MedicationSearch {
  constructor() {
    this.searchTimeout = null;
    this.minSearchLength = 3;
    this.resultsContainer = null;
    this.input = null;
    this.onSelect = () => {};
  }

  async searchMedications(query) {
    clearTimeout(this.searchTimeout);
    return new Promise((resolve) => {
      this.searchTimeout = setTimeout(async () => {
        if (query.length < this.minSearchLength) {
          resolve([]);
          return;
        }
        try {
          const response = await fetch(
            `${DRUGBANK_CONFIG.baseURL}/drug_names?q=${encodeURIComponent(query)}&region=us&fuzzy=true&limit=10`,
            { headers: DRUGBANK_CONFIG.headers }
          );
          const data = await response.json();
          const formatted = data.hits.map(hit => ({
            id: hit.ndc_product_code || hit.local_product_id,
            drugbankId: hit.ingredients && hit.ingredients[0] ? hit.ingredients[0].drugbank_id : null,
            displayName: hit.name,
            genericName: hit.ingredients && hit.ingredients[0] ? hit.ingredients[0].name : '',
            strength: hit.strength ? `${hit.strength.number || ''} ${hit.strength.unit || ''}`.trim() : '',
            dosageForm: hit.dosage_form,
            route: hit.route,
            label: `${hit.name} - ${hit.strength ? (hit.strength.number + (hit.strength.unit || '')) : ''} (${hit.dosage_form})`,
            fullData: hit
          }));
          resolve(formatted);
        } catch (e) {
          console.error('DrugBank API Error:', e);
          resolve([]);
        }
      }, 300);
    });
  }

  attach(input, resultsContainer, onSelect) {
    this.input = input;
    this.resultsContainer = resultsContainer;
    this.onSelect = onSelect;
    input.addEventListener('input', async () => {
      const results = await this.searchMedications(input.value.trim());
      this.renderResults(results);
    });
  }

  renderResults(results) {
    if (!this.resultsContainer) return;
    this.resultsContainer.innerHTML = '';
    if (!results.length) {
      this.resultsContainer.style.display = 'none';
      return;
    }
    this.resultsContainer.style.display = 'block';
    results.forEach(med => {
      const div = document.createElement('div');
      div.className = 'medication-option';
      div.innerHTML = `<div class="med-name">${med.displayName}</div>` +
        `<div class="med-details">${med.genericName ? '(' + med.genericName + ') ' : ''}${med.strength} ${med.dosageForm}</div>`;
      div.addEventListener('click', () => {
        this.onSelect(med);
        this.resultsContainer.innerHTML = '';
        this.resultsContainer.style.display = 'none';
        this.input.value = '';
      });
      this.resultsContainer.appendChild(div);
    });
  }
}

class AllergyChecker {
  constructor() {
    this.commonAllergens = [
      { name: 'Penicillin', drugbankId: 'DB00417', variants: ['amoxicillin', 'ampicillin'] },
      { name: 'Aspirin', drugbankId: 'DB00945', variants: ['ASA', 'acetylsalicylic acid'] },
      { name: 'NSAIDs', drugbankIds: ['DB00328', 'DB00482'], variants: ['ibuprofen', 'naproxen'] },
      { name: 'Sulfa drugs', pattern: 'sulfa', variants: ['sulfamethoxazole'] },
      { name: 'Codeine', drugbankId: 'DB00318', variants: [] }
    ];
  }

  async checkMedicationAllergies(medication, userAllergies) {
    const warnings = [];
    if (!medication.ingredients) return warnings;
    medication.ingredients.forEach(ingredient => {
      userAllergies.forEach(allergy => {
        if (allergy.drugbankId && allergy.drugbankId === ingredient.drugbank_id) {
          warnings.push({
            severity: 'high',
            message: `⚠️ This medication contains ${ingredient.name}, which you've marked as an allergy`
          });
        }
        if (allergy.drugbankIds && allergy.drugbankIds.includes(ingredient.drugbank_id)) {
          warnings.push({
            severity: 'high',
            message: `⚠️ This medication is in the ${allergy.name} class, which you've marked as an allergy`
          });
        }
        if (allergy.variants) {
          const ingredientLower = ingredient.name.toLowerCase();
          allergy.variants.forEach(v => {
            if (ingredientLower.includes(v.toLowerCase())) {
              warnings.push({ severity: 'medium', message: `⚠️ This medication may be related to ${allergy.name}` });
            }
          });
        }
      });
    });
    return warnings;
  }
}

function initMedicationField() {
  const searchInput = document.getElementById('medication-search');
  const results = document.getElementById('medication-results');
  const list = document.getElementById('selected-medications');
  const textarea = document.getElementById('medications');
  if (!searchInput || !results || !list || !textarea) return;

  const medicationSearch = new MedicationSearch();
  const allergyChecker = new AllergyChecker();
  const selected = [];

  function renderSelected() {
    list.innerHTML = '';
    selected.forEach((med, idx) => {
      const item = document.createElement('div');
      item.className = 'medication-item';
      item.innerHTML = `<div class="medication-name">${med.displayName}</div>` +
        `<div class="medication-details">${med.strength} ${med.dosageForm}</div>`;
      const btn = document.createElement('button');
      btn.className = 'delete-btn';
      btn.textContent = 'Remove';
      btn.addEventListener('click', () => {
        selected.splice(idx, 1);
        textarea.value = selected.map(m => m.displayName).join(', ');
        renderSelected();
      });
      item.appendChild(btn);
      list.appendChild(item);
    });
    textarea.value = selected.map(m => m.displayName).join(', ');
  }

  medicationSearch.attach(searchInput, results, async (med) => {
    const userAllergiesText = document.getElementById('allergies')?.value || '';
    const userAllergies = userAllergiesText.split(',').map(a => a.trim()).filter(Boolean);
    const warnings = await allergyChecker.checkMedicationAllergies(med.fullData, allergyChecker.commonAllergens.concat(userAllergies.map(name => ({ name }))));
    const warningContainer = document.getElementById('allergy-warnings');
    warningContainer.innerHTML = '';
    warnings.forEach(w => {
      const div = document.createElement('div');
      div.className = `warning ${w.severity}`;
      div.textContent = w.message;
      warningContainer.appendChild(div);
    });
    selected.push(med);
    renderSelected();
  });
}

window.initMedicationField = initMedicationField;
