
document.addEventListener('DOMContentLoaded', () => {
    const citizenshipSelect = document.getElementById('citizenshipSelect');
    const countrySelect = document.getElementById('countrySelect');

    // Populate citizenship
    citizenshipCountries.forEach(item => {
        const option = document.createElement('option');
        option.value = item.citizenship;
        option.textContent = item.citizenship;
        citizenshipSelect.appendChild(option);
    });

    // Populate Country
    citizenshipCountries.forEach(ct => {
        const option = document.createElement('option');
        option.value = ct.country;
        option.textContent = ct.country;
        countrySelect.appendChild(option);
    });
});


// Populate county, sub-county and ward details
$(document).ready(function(){
  // Load counties
  $.get("/portal/api/regions/counties", function(data){
    data.forEach(c => {
      $("#countySelect").append(`<option value="${c.name}">${c.name}</option>`);
    });
  });

  // Load subcounties on county change
  $("#countySelect").change(function(){
    const county = $(this).val();
    $("#subCountySelect").empty().append('<option value="">- select subcounty -</option>');
    $.get(`/portal/api/regions/subcounties/${county}`, function(data){
      data.forEach(sc => {
        $("#subCountySelect").append(`<option value="${sc.name}">${sc.name}</option>`);
      });
    });
  });

  // Load wards on subcounty change
  $("#subCountySelect").change(function(){
    const county = $("#countySelect").val();
    const subCounty = $(this).val();
    $("#wardSelect").empty().append('<option value="">- select ward -</option>');
    $.get(`/portal/api/regions/wards/${county}/${subCounty}`, function(data){
      Object.keys(data).forEach(ward => {
        $("#wardSelect").append(`<option value="${ward}">${ward}</option>`);
      });
    });
  });
});
