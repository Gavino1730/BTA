// Clean chart configurations for trends page

// Common options for all line charts
function getLineChartOptions(yAxisLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                labels: {
                    font: { size: 13 },
                    color: '#f0f0f0',
                    padding: 15
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0,0,0,0.8)',
                padding: 12,
                titleFont: { size: 13 },
                bodyFont: { size: 12 }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    font: { size: 11 },
                    color: '#c0c0c0'
                },
                title: yAxisLabel ? {
                    display: true,
                    text: yAxisLabel,
                    font: { size: 12 },
                    color: '#c0c0c0'
                } : undefined
            },
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    font: { size: 10 },
                    color: '#c0c0c0',
                    maxRotation: 45,
                    minRotation: 45
                }
            }
        }
    };
}

// Common options for all bar charts
function getBarChartOptions(yAxisLabel, maxY, isPercentage = false) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                labels: {
                    font: { size: 13 },
                    color: '#f0f0f0',
                    padding: 15
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0,0,0,0.8)',
                padding: 12,
                titleFont: { size: 13 },
                bodyFont: { size: 12 },
                callbacks: isPercentage ? {
                    label: function(context) {
                        return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';
                    }
                } : undefined
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: maxY,
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    font: { size: 11 },
                    color: '#c0c0c0',
                    callback: isPercentage ? function(value) {
                        return value + '%';
                    } : undefined
                },
                title: yAxisLabel ? {
                    display: true,
                    text: yAxisLabel,
                    font: { size: 12 },
                    color: '#c0c0c0'
                } : undefined
            },
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    font: { size: 10 },
                    color: '#c0c0c0',
                    maxRotation: 45,
                    minRotation: 45
                }
            }
        }
    };
}

// Dataset styles
const primaryLineStyle = {
    borderColor: '#4169E1',
    backgroundColor: 'rgba(65, 105, 225, 0.1)',
    tension: 0.3,
    fill: true,
    pointRadius: 5,
    pointBackgroundColor: '#4169E1',
    borderWidth: 2
};

const secondaryLineStyle = {
    borderColor: '#9E9E9E',
    backgroundColor: 'rgba(158, 158, 158, 0.1)',
    tension: 0.3,
    fill: true,
    pointRadius: 5,
    pointBackgroundColor: '#9E9E9E',
    borderWidth: 2
};

const accentLineStyle = {
    borderColor: '#32CD32',
    backgroundColor: 'rgba(50, 205, 50, 0.1)',
    tension: 0.3,
    fill: true,
    pointRadius: 5,
    pointBackgroundColor: '#32CD32',
    borderWidth: 2
};

const primaryBarStyle = {
    backgroundColor: 'rgba(65, 105, 225, 0.8)',
    borderColor: '#4169E1',
    borderWidth: 1
};

const secondaryBarStyle = {
    backgroundColor: 'rgba(158, 158, 158, 0.8)',
    borderColor: '#9E9E9E',
    borderWidth: 1
};

const orangeBarStyle = {
    backgroundColor: 'rgba(255, 140, 0, 0.8)',
    borderColor: '#FF8C00',
    borderWidth: 1
};

const redBarStyle = {
    backgroundColor: 'rgba(220, 20, 60, 0.8)',
    borderColor: '#DC143C',
    borderWidth: 1
};

const purpleLineStyle = {
    borderColor: '#9932CC',
    backgroundColor: 'rgba(153, 50, 204, 0.1)',
    tension: 0.3,
    fill: true,
    pointRadius: 5,
    pointBackgroundColor: '#9932CC',
    borderWidth: 2
};
