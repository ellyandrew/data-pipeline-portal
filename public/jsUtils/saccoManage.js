
$(document).ready(function() {
  $("#contributionType").change(function() {
    const payType = $(this).val();
    const sacco_id = $("#mysaccoId").val();

    $("#loanSelect").empty().append('<option value="">- select loan -</option>');

    if (payType === "Loan Repayment") {
    $("#loanSelect").attr("required", true);
      $.get(`/portal/api/loans/applied/${sacco_id}`, function(appliedLoans) {
        if (appliedLoans.length === 0) {
          $("#loanSelect").append('<option value="">No active loans found</option>');
          return;
        }
        appliedLoans.forEach(ln => {
          $("#loanSelect").append(
            `<option value="${ln.loan_id}" data-balance="${ln.balance}" data-type="${ln.loan_type}">
              ${ln.loan_type} (Balance: ${ln.balance}) - ${ln.status}
            </option>`
          );
        });
      }).fail(function() {
        $("#loanSelect").append('<option value="">Error loading loans</option>');
      });
    }else {
      $("#loanSelect").removeAttr("required");
    }
  });
});


// =============== Load Loan Types When Modal Opens ===============
$('#issueLoanModal').on('show.bs.modal', async function() {
  const select = document.getElementById('loan_type_id');
  select.innerHTML = '<option value="">Loading...</option>';

  try {
    const res = await fetch('/portal/loan-types'); // Route to get all loan types
    const loanTypes = await res.json();

    select.innerHTML = '<option value="">Select Loan Type</option>';
    loanTypes.forEach(lt => {
      const option = document.createElement('option');
      option.value = lt.loan_type_id;
      option.textContent = lt.loan_name;
      option.dataset.interest = lt.interest_rate;
      option.dataset.min = lt.min_amount;
      option.dataset.max = lt.max_amount;
      option.dataset.maxTerm = lt.max_term_months;
      select.appendChild(option);
    });
  } catch {
    select.innerHTML = '<option>Error loading loan types</option>';
  }
});

// =============== When Loan Type Changes ===============
document.getElementById('loan_type_id').addEventListener('change', function() {
  const selected = this.options[this.selectedIndex];
  if (!selected.dataset.min) return;

  // Set fields and hints
  document.getElementById('interest_rate').value = selected.dataset.interest;
  const principalInput = document.getElementById('principal');
  principalInput.min = selected.dataset.min;
  principalInput.max = selected.dataset.max;
  document.getElementById('principalHelp').textContent =
    `Allowed range: ${selected.dataset.min} - ${selected.dataset.max}`;
  document.getElementById('repaymentHelp').textContent =
    `Max term: ${selected.dataset.maxTerm} months`;

  calculateLoanDetails(); // Recalculate if already entered values exist
});

// =============== Calculation Function ===============
function calculateLoanDetails() {
  const principal = parseFloat(document.getElementById('principal').value) || 0;
  const interestRate = parseFloat(document.getElementById('interest_rate').value) || 0;
  const repaymentPeriod = parseInt(document.getElementById('repayment_period').value) || 0;
  const issueDateStr = document.getElementById('issue_date').value;

  if (principal <= 0 || interestRate <= 0 || repaymentPeriod <= 0) return;

  // Calculate interest amount (simple interest)
  const interestAmount = (principal * (interestRate / 100)) * (repaymentPeriod / 12);
  const totalRepayment = principal + interestAmount;

  document.getElementById('interest_amount').value = interestAmount.toFixed(2);
  document.getElementById('total_repayment').value = totalRepayment.toFixed(2);

  // Calculate due date
  if (issueDateStr) {
    const issueDate = new Date(issueDateStr);
    issueDate.setMonth(issueDate.getMonth() + repaymentPeriod);
    const dueDate = issueDate.toISOString().split('T')[0];
    document.getElementById('due_date').value = dueDate;
  }
}

// Trigger recalculations
['principal', 'repayment_period', 'interest_rate', 'issue_date']
  .forEach(id => document.getElementById(id).addEventListener('input', calculateLoanDetails));
