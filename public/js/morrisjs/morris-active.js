// Dashboard 1 Morris-chart

Morris.Area({
    element: 'morris-area-chart',
    data: [
        { period: '2025-01-01', Beneficiaries: 120, Membership: 45, Institution: 10 },
        { period: '2025-02-01', Beneficiaries: 150, Membership: 60, Institution: 12 },
        { period: '2025-03-01', Beneficiaries: 180, Membership: 70, Institution: 14 },
        { period: '2025-04-01', Beneficiaries: 160, Membership: 75, Institution: 1 },
        { period: '2025-05-01', Beneficiaries: 200, Membership: 90, Institution: 10 },
        { period: '2025-06-01', Beneficiaries: 220, Membership: 110, Institution: 5 },
        { period: '2025-07-01', Beneficiaries: 250, Membership: 12, Institution: 22 },
        { period: '2025-08-01', Beneficiaries: 270, Membership: 100, Institution: 24 },
        { period: '2025-09-01', Beneficiaries: 300, Membership: 150, Institution: 2 },
        { period: '2025-10-01', Beneficiaries: 320, Membership: 60, Institution: 28 },
        { period: '2025-11-01', Beneficiaries: 350, Membership: 170, Institution: 3 },
        { period: '2025-12-01', Beneficiaries: 400, Membership: 180, Institution: 10 }
    ],
    xkey: 'period',
    ykeys: ['Beneficiaries', 'Membership', 'Institution'],
    labels: ['Beneficiaries', 'Membership', 'Institutions'],
    xLabels: "month",  
    dateFormat: function (x) {
        return new Date(x).toLocaleString('default', { month: 'short' });
    },
    pointSize: 0,
    fillOpacity: 0.6,
    pointStrokeColors: ['#f75b36', '#00b5c2', '#008efa'],
    behaveLikeLine: true,
    gridLineColor: '#e0e0e0',
    lineWidth: 0,
    hideHover: 'auto',
    lineColors: ['#f75b36', '#00b5c2', '#008efa'],
    resize: true
});


Morris.Area({
    element: 'extra-area-chart',
    data: [
        { period: 'Jan', Applications: 5, Contributions: 10000, Loans: 2000 },
        { period: 'Feb', Applications: 8, Contributions: 12000, Loans: 3500 },
        { period: 'Mar', Applications: 10, Contributions: 15000, Loans: 5000 },
        { period: 'Apr', Applications: 12, Contributions: 18000, Loans: 6000 },
        { period: 'May', Applications: 15, Contributions: 20000, Loans: 7500 },
        { period: 'Jun', Applications: 20, Contributions: 25000, Loans: 9000 },
        { period: 'Jul', Applications: 18, Contributions: 23000, Loans: 8500 },
        { period: 'Aug', Applications: 22, Contributions: 28000, Loans: 10000 },
        { period: 'Sep', Applications: 25, Contributions: 30000, Loans: 12000 },
        { period: 'Oct', Applications: 30, Contributions: 35000, Loans: 15000 },
        { period: 'Nov', Applications: 28, Contributions: 34000, Loans: 14000 },
        { period: 'Dec', Applications: 35, Contributions: 40000, Loans: 18000 }
    ],
    xkey: 'period',
    ykeys: ['Applications', 'Contributions', 'Loans'],
    labels: ['Applications', 'Contributions', 'Loans'],
    parseTime: false,  
    pointSize: 0,
    lineWidth: 0,
    resize: true,
    fillOpacity: 0.8,
    behaveLikeLine: true,
    gridLineColor: '#e0e0e0',
    hideHover: 'auto',
    lineColors: ['#f75b36', '#00b5c2', '#8698b7']
});

