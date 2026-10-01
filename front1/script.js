/**
 * Dashboard Analisis Sentimen Pelabuhan
 * Frontend JavaScript — connects to Flask API (api_server.py)
 */

// ==========================================
// CONFIG & STATE
// ==========================================
const API_BASE = 'http://localhost:5000/api';

let dashboardData = null;
let selectedPorts = [];
let allPorts = [];

const COMMON_HOVERLABEL = {
    bgcolor: '#FFFFFF',
    bordercolor: '#CCCCCC',
    font: { color: '#000000', family: 'Inter, sans-serif' }
};

const PORT_COLORS = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
];

function getPortColor(port) {
    const idx = allPorts.indexOf(port);
    return PORT_COLORS[idx % PORT_COLORS.length];
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    fetchEvalMetrics();
});

// ==========================================
// DATA FETCHING
// ==========================================
async function fetchData() {
    showLoading(true);

    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const ports = selectedPorts.length > 0 ? selectedPorts.join(',') : '';

    const params = new URLSearchParams();
    if (ports) params.set('ports', ports);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);

    try {
        const response = await fetch(`${API_BASE}/data?${params.toString()}`);
        if (!response.ok) throw new Error('Data tidak ditemukan');
        dashboardData = await response.json();

        // Initialize port list on first load
        if (allPorts.length === 0) {
            allPorts = dashboardData.all_ports;
            selectedPorts = [...allPorts];
            renderPortChecks();
            document.getElementById('startDate').value = dashboardData.min_date;
            document.getElementById('endDate').value = dashboardData.max_date;
        }

        renderDashboard();
    } catch (err) {
        console.error('Fetch error:', err);
        document.getElementById('emptyAlert').style.display = 'flex';
        document.getElementById('emptyAlert').textContent = '❌ Gagal memuat data. Pastikan api_server.py berjalan di http://localhost:5000';
    } finally {
        showLoading(false);
    }
}

async function fetchEvalMetrics() {
    try {
        const response = await fetch(`${API_BASE}/eval_metrics`);
        if (!response.ok) throw new Error('Metrics not found');
        const metrics = await response.json();
        renderEvalMetrics(metrics);
    } catch (err) {
        document.getElementById('metricsGrid').innerHTML =
            '<div class="alert alert-warning" style="grid-column:1/-1;">⚠️ File metrik evaluasi belum tersedia.</div>';
    }
}

async function refreshData() {
    try {
        await fetch(`${API_BASE}/reload`, { method: 'POST' });
    } catch (e) { /* ignore */ }
    fetchData();
}

// ==========================================
// RENDERING
// ==========================================
function renderDashboard() {
    const d = dashboardData;
    if (!d) return;

    // KPI
    document.getElementById('kpiTotal').textContent = d.kpi.total_reviews.toLocaleString();
    document.getElementById('kpiRating').textContent = `${Number(d.kpi.avg_rating).toFixed(1)} ⭐`;
    document.getElementById('kpiPorts').textContent = d.kpi.ports_counted;
    document.getElementById('emptyAlert').style.display = isEmpty ? 'flex' : 'none';
    document.getElementById('tabsContainer').style.display = isEmpty ? 'none' : 'block';
    document.getElementById('insightsSection').style.display = isEmpty ? 'none' : 'block';

    if (isEmpty) return;

    // Validate dates
    const s = document.getElementById('startDate').value;
    const e = document.getElementById('endDate').value;
    document.getElementById('dateError').style.display = (s && e && s > e) ? 'flex' : 'none';

    // Charts
    renderPopularity(d.popularity);
    renderScatter(d.scatter);
    renderTrend(d.trend);
    renderAspectSentiment(d.aspect_sentiment);
    renderAspectFilters(d.unique_aspects);
    renderWordCloud(d.wordcloud_words);
    renderHeatmap(d.heatmap);
    renderInsights(d.insights);
    renderRawTable(d.table);
}

// ==========================================
// SIDEBAR
// ==========================================
function renderPortChecks() {
    const container = document.getElementById('portChecks');
    container.innerHTML = '';
    allPorts.forEach(port => {
        const label = document.createElement('label');
        label.className = 'port-check-item';
        label.innerHTML = `
            <input type="checkbox" value="${port}" checked onchange="onPortChange()">
            <span>${port}</span>
        `;
        container.appendChild(label);
    });
}

function onPortChange() {
    const checks = document.querySelectorAll('#portChecks input[type="checkbox"]');
    selectedPorts = Array.from(checks).filter(c => c.checked).map(c => c.value);
    fetchData();
}

function onDateChange() {
    fetchData();
}

// Add event listeners for date changes
document.getElementById('startDate')?.addEventListener('change', onDateChange);
document.getElementById('endDate')?.addEventListener('change', onDateChange);

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('toggleSidebarBtn');
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    btn.textContent = isCollapsed ? '⏩ Tampilkan Sidebar' : '⏪ Sembunyikan Sidebar';
}

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tabId, btnEl) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btnEl.classList.add('active');

    // Re-render charts when tab becomes visible (Plotly needs visible containers)
    if (tabId === 'tab1' && dashboardData) {
        setTimeout(() => {
            Plotly.Plots.resize(document.getElementById('chartPopularity'));
            Plotly.Plots.resize(document.getElementById('chartScatter'));
            Plotly.Plots.resize(document.getElementById('chartTrend'));
            try { Plotly.Plots.resize(document.getElementById('chartAspect')); } catch(e) {}
            try { Plotly.Plots.resize(document.getElementById('chartAspectTrend')); } catch(e) {}
        }, 50);
    }
    if (tabId === 'tab2' && dashboardData) {
        setTimeout(() => {
            renderWordCloud(dashboardData.wordcloud_words);
            try { Plotly.Plots.resize(document.getElementById('chartHeatmap')); } catch(e) {}
        }, 50);
    }
    if (tabId === 'tab4') {
        setTimeout(() => {
            try { Plotly.Plots.resize(document.getElementById('chartConfusionMatrix')); } catch(e) {}
        }, 50);
    }
}

// ==========================================
// CHART: Popularity (Horizontal Bar)
// ==========================================
function renderPopularity(data) {
    if (!data || data.length === 0) {
        document.getElementById('chartPopularity').innerHTML = '<div class="alert alert-info">Tidak ada data.</div>';
        return;
    }

    const sorted = [...data].sort((a, b) => a.count - b.count);
    const trace = {
        type: 'bar',
        orientation: 'h',
        y: sorted.map(d => d.pelabuhan),
        x: sorted.map(d => d.count),
        text: sorted.map(d => d.count),
        textposition: 'outside',
        hoverlabel: COMMON_HOVERLABEL,
        marker: {
            color: sorted.map(d => getPortColor(d.pelabuhan)),
            cornerradius: 4
        },
        hovertemplate: '<b>%{y}</b><br>Terdapat %{x} ulasan yang masuk di pelabuhan ini.<extra></extra>'
    };

    const layout = {
        height: 400,
        margin: { l: 200, r: 40, t: 20, b: 30 },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { showgrid: false },
        yaxis: { automargin: true },
        hoverlabel: COMMON_HOVERLABEL,
        showlegend: false,
        font: { family: 'Inter, sans-serif' }
    };

    Plotly.newPlot('chartPopularity', [trace], layout, { responsive: true, displayModeBar: false });
}

// ==========================================
// CHART: Scatter (Quality vs Volume)
// ==========================================
function renderScatter(data) {
    if (!data || data.length === 0) {
        document.getElementById('chartScatter').innerHTML = '<div class="alert alert-info">Tidak ada data.</div>';
        return;
    }

    const trace = {
        type: 'scatter',
        mode: 'markers',
        x: data.map(d => d.volume),
        y: data.map(d => d.avg_rating),
        text: data.map(d => d.pelabuhan),
        hoverlabel: COMMON_HOVERLABEL,
        marker: {
            size: data.map(d => Math.max(12, Math.min(d.volume / 5, 45))),
            color: data.map(d => getPortColor(d.pelabuhan)),
            opacity: 0.85,
            line: { width: 2, color: 'white' }
        },
        hovertemplate: '<b>%{text}</b><br>Rata-rata Rating: %{y:.1f} Bintang<br>Total Ulasan: %{x}<extra></extra>'
    };

    const layout = {
        height: 400,
        margin: { l: 50, r: 20, t: 20, b: 50 },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        hoverlabel: COMMON_HOVERLABEL,
        xaxis: { title: 'Volume (Jumlah Ulasan)', showgrid: true, gridcolor: '#EEEEEE' },
        yaxis: { title: 'Kualitas (Rata-rata Rating)', range: [1, 5.5], showgrid: true, gridcolor: '#EEEEEE' },
        showlegend: false,
        font: { family: 'Inter, sans-serif' }
    };

    Plotly.newPlot('chartScatter', [trace], layout, { responsive: true, displayModeBar: false });
}

// ==========================================
// CHART: Trend Line
// ==========================================
function renderTrend(data) {
    if (!data || data.length === 0) {
        document.getElementById('chartTrend').innerHTML = '<div class="alert alert-info">Tidak ada data tren.</div>';
        return;
    }

    const ports = [...new Set(data.map(d => d.pelabuhan))];
    const traces = ports.map(port => {
        const portData = data.filter(d => d.pelabuhan === port).sort((a, b) => a.bulan_tahun.localeCompare(b.bulan_tahun));
        return {
            type: 'scatter',
            mode: 'lines+markers',
            name: port,
            x: portData.map(d => d.bulan_tahun),
            y: portData.map(d => d.count),
            line: { color: getPortColor(port), shape: 'linear', width: 2 },
            marker: { size: 6 },
            hoverlabel: COMMON_HOVERLABEL,
            hovertemplate: `<b>${port}</b><br>Bulan: %{x}<br>Jumlah Ulasan: %{y}<extra></extra>`
        };
    });

    const layout = {
        height: 400,
        margin: { l: 50, r: 20, t: 20, b: 80 },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        hovermode: 'x unified',
        hoverlabel: COMMON_HOVERLABEL,
        xaxis: { showgrid: false, tickangle: -45 },
        yaxis: { showgrid: true, gridcolor: '#EEEEEE', title: 'Volume Ulasan' },
        legend: { orientation: 'h', y: 1.08, x: 1, xanchor: 'right' },
        font: { family: 'Inter, sans-serif' }
    };

    Plotly.newPlot('chartTrend', traces, layout, { responsive: true, displayModeBar: false });
}

// ==========================================
// CHART: Aspect Sentiment (Grouped Bar with Facets)
// ==========================================
function renderAspectSentiment(data) {
    const container = document.getElementById('chartAspect');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Tidak ada data aspek.</div>';
        return;
    }

    const ports = [...new Set(data.map(d => d.pelabuhan))];
    const sentimentOrder = ['NEGATIF', 'NETRAL', 'POSITIF'];
    const sentimentColors = { 'POSITIF': '#2E7D32', 'NETRAL': '#B0BEC5', 'NEGATIF': '#E53935' };

    const cols = 2;
    const rows = Math.ceil(ports.length / cols);
    const gapX = 0.08;
    const gapY = 0.22; // Increased vertical gap to prevent collision with upper subplots

    const traces = [];
    const annotations = [];

    ports.forEach((port, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const xDomain = [col / cols + gapX / 2, (col + 1) / cols - gapX / 2];
        const yDomain = [1 - (row + 1) / rows + gapY / 2, 1 - row / rows - gapY / 2];

        const portData = data.filter(d => d.pelabuhan === port);

        sentimentOrder.forEach(sent => {
            const sentData = portData.filter(d => d.sentiment === sent);
            traces.push({
                type: 'bar',
                name: sent,
                x: sentData.map(d => d.aspects),
                y: sentData.map(d => d.count),
                marker: { color: sentimentColors[sent] },
                xaxis: i === 0 ? 'x' : `x${i + 1}`,
                yaxis: i === 0 ? 'y' : `y${i + 1}`,
                showlegend: i === 0,
                legendgroup: sent,
                hoverlabel: COMMON_HOVERLABEL,
                hovertemplate: `<b>%{x}</b><br>${sent}: %{y}<extra></extra>`
            });
        });

        annotations.push({
            text: `<b>${port}</b>`,
            xref: 'paper',
            yref: 'paper',
            x: (col + 0.5) / cols,
            y: yDomain[1] + 0.035,
            yanchor: 'bottom',
            showarrow: false,
            font: { size: 13, color: '#0A2647' }
        });
    });

    const subplotLayout = {
        height: Math.max(650, rows * 420),
        margin: { l: 50, r: 20, t: 60, b: 80 },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        barmode: 'group',
        hoverlabel: COMMON_HOVERLABEL,
        annotations: annotations,
        legend: { orientation: 'h', y: 1.05, x: 0.5, xanchor: 'center' },
        font: { family: 'Inter, sans-serif' }
    };

    ports.forEach((port, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const xDomain = [col / cols + gapX / 2, (col + 1) / cols - gapX / 2];
        const yDomain = [1 - (row + 1) / rows + gapY / 2, 1 - row / rows - gapY / 2];

        const xKey = i === 0 ? 'xaxis' : `xaxis${i + 1}`;
        const yKey = i === 0 ? 'yaxis' : `yaxis${i + 1}`;

        subplotLayout[xKey] = {
            domain: xDomain,
            showgrid: false,
            tickangle: -45,
            anchor: i === 0 ? 'y' : `y${i + 1}`
        };
        subplotLayout[yKey] = {
            domain: yDomain,
            showgrid: true,
            gridcolor: '#EEEEEE',
            anchor: i === 0 ? 'x' : `x${i + 1}`
        };
    });

    Plotly.newPlot('chartAspect', traces, subplotLayout, { responsive: true, displayModeBar: false });
}

// ==========================================
// ASPECT TREND FILTERS & CHART
// ==========================================
function renderAspectFilters(aspects) {
    const container = document.getElementById('aspectChecks');
    container.innerHTML = '';
    if (!aspects || aspects.length === 0) {
        container.innerHTML = '<span style="color:var(--muted); font-size:0.82rem;">Data aspek belum tersedia.</span>';
        return;
    }

    aspects.forEach((asp, i) => {
        const label = document.createElement('label');
        label.className = 'aspect-check-item';
        label.innerHTML = `
            <input type="checkbox" value="${asp}" ${i < 3 ? 'checked' : ''} onchange="renderAspectTrend()">
            <span>${asp}</span>
        `;
        container.appendChild(label);
    });

    renderAspectTrend();
}

function renderAspectTrend() {
    const container = document.getElementById('chartAspectTrend');
    if (!dashboardData || !dashboardData.aspect_trend || dashboardData.aspect_trend.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Tidak ada data tren aspek.</div>';
        return;
    }

    const selectedAspects = Array.from(document.querySelectorAll('#aspectChecks input:checked')).map(c => c.value);
    const focusRadio = document.querySelector('input[name="sentimentFocus"]:checked');
    const focusValue = focusRadio ? focusRadio.value : 'all';

    if (selectedAspects.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">⚠️ Silakan pilih minimal satu aspek pada filter di atas.</div>';
        return;
    }

    let trendData = dashboardData.aspect_trend.filter(d => selectedAspects.includes(d.aspects));

    if (trendData.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Tidak ada data untuk aspek yang dipilih.</div>';
        return;
    }

    const ports = [...new Set(trendData.map(d => d.pelabuhan))];
    const aspects = [...new Set(trendData.map(d => d.aspects))];

    const aspectColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'];

    const cols = 2;
    const rows = Math.ceil(ports.length / cols);
    const gapX = 0.08, gapY = 0.22;
    const traces = [];
    const annotations = [];

    ports.forEach((port, pi) => {
        const row = Math.floor(pi / cols);
        const col = pi % cols;
        const xDomain = [col / cols + gapX / 2, (col + 1) / cols - gapX / 2];
        const yDomain = [1 - (row + 1) / rows + gapY / 2, 1 - row / rows - gapY / 2];

        aspects.forEach((asp, ai) => {
            const aspData = trendData.filter(d => d.pelabuhan === port && d.aspects === asp);
            aspData.sort((a, b) => a.bulan_tahun.localeCompare(b.bulan_tahun));

            traces.push({
                type: 'scatter',
                mode: 'lines+markers',
                name: asp,
                x: aspData.map(d => d.bulan_tahun),
                y: aspData.map(d => d.count),
                line: { color: aspectColors[ai % aspectColors.length], shape: 'spline', width: 2 },
                marker: { size: 5 },
                xaxis: pi === 0 ? 'x' : `x${pi + 1}`,
                yaxis: pi === 0 ? 'y' : `y${pi + 1}`,
                showlegend: pi === 0,
                legendgroup: asp,
                hoverlabel: COMMON_HOVERLABEL,
                hovertemplate: `<b>${asp}</b><br>Bulan: %{x}<br>Jumlah: %{y}<extra></extra>`
            });
        });

        annotations.push({
            text: `<b>${port}</b>`,
            xref: 'paper', yref: 'paper',
            x: (col + 0.5) / cols,
            y: yDomain[1] + 0.035,
            yanchor: 'bottom',
            showarrow: false,
            font: { size: 13, color: '#0A2647' }
        });
    });

    const subLayout = {
        height: Math.max(550, rows * 400),
        margin: { l: 50, r: 20, t: 40, b: 100 },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        hovermode: 'x unified',
        hoverlabel: COMMON_HOVERLABEL,
        annotations: annotations,
        legend: { orientation: 'h', y: -0.12, x: 0.5, xanchor: 'center', title: { text: '' } },
        font: { family: 'Inter, sans-serif' }
    };

    ports.forEach((port, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const xDomain = [c / cols + gapX / 2, (c + 1) / cols - gapX / 2];
        const yDomain = [1 - (r + 1) / rows + gapY / 2, 1 - r / rows - gapY / 2];
        const xKey = i === 0 ? 'xaxis' : `xaxis${i + 1}`;
        const yKey = i === 0 ? 'yaxis' : `yaxis${i + 1}`;
        subLayout[xKey] = { domain: xDomain, showgrid: false, tickangle: -45, anchor: i === 0 ? 'y' : `y${i + 1}` };
        subLayout[yKey] = { domain: yDomain, showgrid: true, gridcolor: '#EEEEEE', title: 'Jumlah', anchor: i === 0 ? 'x' : `x${i + 1}` };
    });

    Plotly.newPlot('chartAspectTrend', traces, subLayout, { responsive: true, displayModeBar: false });
}

// ==========================================
// CHART: WordCloud (using wordcloud2.js)
// ==========================================
function renderWordCloud(words) {
    const canvas = document.getElementById('wordcloudCanvas');
    if (!words || Object.keys(words).length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Inter';
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.fillText('Tidak ada data teks untuk WordCloud', canvas.width / 2, canvas.height / 2);
        return;
    }

    const wordList = Object.entries(words).sort((a, b) => b[1] - a[1]);
    const maxFreq = wordList[0][1];

    // Scale words
    const scaled = wordList.map(([word, freq]) => [word, Math.max(8, Math.round((freq / maxFreq) * 80))]);

    // Ocean-theme color palette
    const oceanColors = ['#0A2647', '#144272', '#1B6B93', '#2C9FA3', '#3DB8BC', '#205295', '#0E86D4', '#416D99', '#367FA9'];

    try {
        WordCloud(canvas, {
            list: scaled,
            gridSize: 6,
            weightFactor: 1,
            fontFamily: 'Sora, Inter, sans-serif',
            color: function () {
                return oceanColors[Math.floor(Math.random() * oceanColors.length)];
            },
            backgroundColor: 'white',
            rotateRatio: 0.3,
            rotationSteps: 2,
            shuffle: true,
            drawOutOfBound: false
        });
    } catch (e) {
        console.warn('WordCloud rendering issue:', e);
    }
}

// ==========================================
// CHART: Heatmap
// ==========================================
function renderHeatmap(data) {
    const container = document.getElementById('chartHeatmap');
    if (!data || !data.values || data.values.length === 0) {
        container.innerHTML = '<div class="alert alert-success">Luar biasa! Tidak ada ulasan negatif (Rating 1 & 2) yang ditemukan.</div>';
        return;
    }

    const trace = {
        type: 'heatmap',
        z: data.values,
        x: data.months,
        y: data.ports,
        colorscale: 'Reds',
        showscale: true,
        colorbar: { title: 'Jumlah Keluhan', titleside: 'right' },
        hovertemplate: '<b>%{y}</b><br>Bulan: %{x}<br>Keluhan: %{z}<extra></extra>',
        // Show annotations
        texttemplate: '%{z}',
        textfont: { size: 11, color: '#333', family: 'IBM Plex Mono' }
    };

    const layout = {
        height: 400,
        margin: { l: 200, r: 80, t: 20, b: 80 },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { title: 'Periode Waktu (Bulan)', tickangle: -45 },
        yaxis: { title: 'Terminal Pelabuhan', automargin: true },
        font: { family: 'Inter, sans-serif' }
    };

    Plotly.newPlot('chartHeatmap', [trace], layout, { responsive: true, displayModeBar: false });
}

// ==========================================
// INSIGHTS
// ==========================================
function renderInsights(insights) {
    if (!insights) return;

    const list = document.getElementById('insightList');
    const items = [];

    if (insights.top_complaint_port) {
        items.push(`<strong>Volume Keluhan Tertinggi:</strong> Pelabuhan <strong>${insights.top_complaint_port}</strong> mencatatkan keluhan terbanyak yaitu <strong>${insights.top_complaint_count} ulasan negatif</strong> (sekitar ${insights.top_complaint_ratio}% dari total ulasan di pelabuhan tersebut pada periode yang dipilih).`);
    } else {
        items.push(`<strong>Status Layanan:</strong> Tidak ditemukan keluhan signifikan (Rating ≤ 2) pada filter data yang dipilih saat ini.`);
    }

    if (insights.top_aspect) {
        items.push(`<strong>Aspek Masalah Utama:</strong> Aspek <strong>'${insights.top_aspect}'</strong> adalah isu yang paling sering dikeluhkan oleh konsumen (muncul sebanyak <strong>${insights.top_aspect_count} kali</strong>), dengan konsentrasi keluhan tertinggi berada di <strong>${insights.top_aspect_port}</strong> (${insights.top_aspect_port_count} ulasan).`);
    }

    items.push(`<strong>Statistik Keseluruhan:</strong> Dari total <strong>${(insights.total_reviews || 0).toLocaleString()}</strong> ulasan terfilter, terdapat <strong>${(insights.total_negative || 0).toLocaleString()} keluhan (Rating 1-2)</strong>, dengan rata-rata rating kepuasan konsumen berada di angka <strong>${(Number(insights.avg_rating) || 0).toFixed(1)} ⭐</strong>.`);

    list.innerHTML = items.map(item => `<li>${item}</li>`).join('');

    // Negative review samples
    const samplesContainer = document.getElementById('insightNegSamples');
    if (insights.sample_negative && insights.sample_negative.length > 0) {
        samplesContainer.innerHTML = insights.sample_negative.map(s => `
            <div class="neg-review-sample">
                <div class="meta"><strong>${s.port}</strong> • ${s.date} • ${'⭐'.repeat(s.rating)}</div>
                <div class="text">"${s.text}"</div>
            </div>
        `).join('');
    } else {
        samplesContainer.innerHTML = '<div class="alert alert-info" style="margin:0;">Tidak ada sampel keluhan terbaru pada filter yang aktif.</div>';
    }
}

// ==========================================
// EVAL METRICS & CONFUSION MATRIX
// ==========================================
function renderEvalMetrics(metrics) {
    const grid = document.getElementById('metricsGrid');
    const metricDefs = [
        { key: 'accuracy', label: 'Accuracy' },
        { key: 'precision', label: 'Precision' },
        { key: 'recall', label: 'Recall' },
        { key: 'f1_score', label: 'F1-Score' }
    ];

    grid.innerHTML = metricDefs.map(m => `
        <div class="metric-card">
            <div class="metric-label">${m.label}</div>
            <div class="metric-value">${((metrics[m.key] || 0) * 100).toFixed(1)}%</div>
        </div>
    `).join('');

    // Confusion Matrix
    if (metrics.confusion_matrix && metrics.confusion_matrix.length > 0) {
        const labels = metrics.labels || ['NEGATIF', 'NETRAL', 'POSITIF'];
        const cm = metrics.confusion_matrix;

        const trace = {
            type: 'heatmap',
            z: cm,
            x: labels,
            y: labels,
            colorscale: 'Blues',
            showscale: true,
            texttemplate: '%{z}',
            textfont: { size: 16, family: 'IBM Plex Mono', color: '#333' },
            hovertemplate: 'True: %{y}<br>Predicted: %{x}<br>Count: %{z}<extra></extra>'
        };

        const layout = {
            height: 400,
            margin: { l: 100, r: 60, t: 20, b: 80 },
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)',
            xaxis: { title: 'Predicted Label', tickangle: 0 },
            yaxis: { title: 'True Label', autorange: 'reversed' },
            font: { family: 'Inter, sans-serif' }
        };

        Plotly.newPlot('chartConfusionMatrix', [trace], layout, { responsive: true, displayModeBar: false });
    } else {
        document.getElementById('chartConfusionMatrix').innerHTML = '<div class="alert alert-warning">Data Confusion Matrix tidak ditemukan.</div>';
    }
}

// ==========================================
// RAW TABLE
// ==========================================
function renderRawTable(tableData) {
    const tbody = document.getElementById('rawTableBody');
    if (!tableData || tableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--muted);">Tidak ada data.</td></tr>';
        return;
    }

    tbody.innerHTML = tableData.map(row => `
        <tr>
            <td>${row.pelabuhan || ''}</td>
            <td>${row.tanggal || ''}</td>
            <td title="${(row.review_text || '').replace(/"/g, '&quot;')}">${(row.review_text || '').substring(0, 120)}${(row.review_text || '').length > 120 ? '...' : ''}</td>
            <td>${row.review_rating || ''}</td>
            <td>${row.aspects || ''}</td>
        </tr>
    `).join('');
}

// ==========================================
// PREDICTION (Tab 3)
// ==========================================
async function predictSentiment() {
    const input = document.getElementById('predictInput').value.trim();
    const resultDiv = document.getElementById('predictResult');
    const btn = document.getElementById('predictBtn');

    if (!input) {
        resultDiv.innerHTML = '<div class="alert alert-warning" style="margin-top:1rem;">⚠️ Silakan masukkan teks ulasan terlebih dahulu.</div>';
        resultDiv.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Memproses...';

    try {
        const response = await fetch(`${API_BASE}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: input })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Gagal memprediksi');
        }

        const result = await response.json();
        const colorMap = { 'POSITIF': '#2E7D32', 'NEGATIF': '#E53935', 'NETRAL': '#78909C' };
        const predColor = colorMap[result.prediction] || '#78909C';

        resultDiv.innerHTML = `
            <div class="predict-result">
                <div class="predict-label-box">
                    <div class="result-label">Hasil Prediksi AI:</div>
                    <div class="result-value" style="color:${predColor};">${result.prediction}</div>
                    <div class="processed-text">
                        <strong>Teks yang masuk ke model (setelah Sastrawi):</strong><br>
                        '${result.processed_text}'
                    </div>
                </div>
                <div>
                    <p style="font-weight:600; margin-bottom:0.6rem;">Tingkat Keyakinan SVM (Probabilitas):</p>
                    <div class="prob-bars">
                        <div class="prob-bar-item">
                            <label>Positif: ${(result.probabilities.positif * 100).toFixed(1)}%</label>
                            <div class="prob-bar-track">
                                <div class="prob-bar-fill positif" style="width:${Math.max(result.probabilities.positif * 100, 2)}%;">
                                    ${(result.probabilities.positif * 100).toFixed(1)}%
                                </div>
                            </div>
                        </div>
                        <div class="prob-bar-item">
                            <label>Netral: ${(result.probabilities.netral * 100).toFixed(1)}%</label>
                            <div class="prob-bar-track">
                                <div class="prob-bar-fill netral" style="width:${Math.max(result.probabilities.netral * 100, 2)}%;">
                                    ${(result.probabilities.netral * 100).toFixed(1)}%
                                </div>
                            </div>
                        </div>
                        <div class="prob-bar-item">
                            <label>Negatif: ${(result.probabilities.negatif * 100).toFixed(1)}%</label>
                            <div class="prob-bar-track">
                                <div class="prob-bar-fill negatif" style="width:${Math.max(result.probabilities.negatif * 100, 2)}%;">
                                    ${(result.probabilities.negatif * 100).toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </div>
                    ${!result.has_proba ? '<div class="alert alert-warning" style="margin-top:0.8rem;">Model SVM tidak dikonfigurasi untuk mengeluarkan probabilitas.</div>' : ''}
                </div>
            </div>
        `;
        resultDiv.style.display = 'block';
    } catch (err) {
        resultDiv.innerHTML = `<div class="alert alert-error" style="margin-top:1rem;">❌ ${err.message}</div>`;
        resultDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analisis Ulasan (SVM)';
    }
}

// ==========================================
// MODAL (Enlarge Chart)
// ==========================================
function enlargeChart(chartId) {
    const source = document.getElementById(chartId);
    const modal = document.getElementById('modalOverlay');
    const modalChart = document.getElementById('modalChartContainer');

    // Get plotly data from source
    const plotData = source.data;
    const plotLayout = source.layout;

    if (!plotData) {
        alert('Tidak ada chart untuk diperbesar.');
        return;
    }

    // Deep clone layout and adjust
    const newLayout = JSON.parse(JSON.stringify(plotLayout));
    newLayout.height = 600;
    newLayout.width = undefined;

    modal.classList.add('visible');

    setTimeout(() => {
        Plotly.newPlot(modalChart, plotData, newLayout, { responsive: true, displayModeBar: true });
    }, 100);
}

function closeModal(event) {
    if (event.target === document.getElementById('modalOverlay')) {
        closeModalDirect();
    }
}

function closeModalDirect() {
    document.getElementById('modalOverlay').classList.remove('visible');
    Plotly.purge(document.getElementById('modalChartContainer'));
}

// ==========================================
// EXPANDER
// ==========================================
function toggleExpander(header) {
    header.classList.toggle('open');
    const body = header.nextElementSibling;
    body.classList.toggle('open');
}

// ==========================================
// LOADING
// ==========================================
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModalDirect();
});
