// Populate Edit Modal
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.getElementById('edit_loan_id').value = this.dataset.id;
      document.getElementById('edit_loan_name').value = this.dataset.name;
      document.getElementById('edit_max_term').value = this.dataset.term;
      document.getElementById('edit_min_amount').value = this.dataset.min;
      document.getElementById('edit_max_amount').value = this.dataset.max;
    });
  });