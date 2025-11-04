
  function toggleCertificateField() {
    const training = document.getElementById('receivedTraining').value;
    document.getElementById('certificateField').style.display = (training === 'Yes') ? 'block' : 'none';
  }

  function toggleOtherClassification() {
    const classification = document.querySelector('[name="facilityClassification"]').value;
    document.getElementById('otherClassDiv').style.display = (classification === 'Other') ? 'block' : 'none';
  }

  function checkChildrenTotal() {
    const total = parseInt(document.getElementById('totalChildren').value) || 0;
    const girls = parseInt(document.getElementById('girls').value) || 0;
    const boys = parseInt(document.getElementById('boys').value) || 0;
    const warning = document.getElementById('childrenWarning');
    warning.textContent = (girls + boys !== total) ? '⚠️ The total number of girls & boys differs from total children entered earlier. Please rectify before proceeding!' : '';
  }

  function checkWorkerTotal() {
    const total = parseInt(document.getElementById('total_workers').value) || 0;
    const females = parseInt(document.getElementById('female_workers').value) || 0;
    const males = parseInt(document.getElementById('male_workers').value) || 0;
    const warning = document.getElementById('workerWarning');
    warning.textContent = (females + males !== total) ? '⚠️ The total number of male & female workers differs from total workers entered. Please check.' : '';
  }
