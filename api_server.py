"""
Flask API Server — Backend untuk Dashboard HTML.
Menyajikan data dari final_dataset.csv, model SVM, dan endpoint visualisasi.
File app.py (Streamlit) TIDAK dihapus dan tetap bisa dijalankan secara terpisah.
"""

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import pandas as pd
import numpy as np
import os
import re
import json
import ast
import io
import joblib
import math
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# ==========================================
# CONFIG
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PROCESSED = os.path.join(BASE_DIR, 'data', 'processed')
MODELS_DIR = os.path.join(BASE_DIR, 'data', 'models')

# ==========================================
# PREPROCESSING TOOLS (LAZY LOAD)
# ==========================================
_stemmer = None
_stopword_remover = None

def _get_preprocessing_tools():
    global _stemmer, _stopword_remover
    if _stemmer is None:
        from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
        from Sastrawi.StopWordRemover.StopWordRemoverFactory import StopWordRemoverFactory, StopWordRemover, ArrayDictionary
        stemmer_factory = StemmerFactory()
        _stemmer = stemmer_factory.create_stemmer()
        stopword_factory = StopWordRemoverFactory()
        default_stopwords = stopword_factory.get_stop_words()
        custom_stopwords = [
            'menjadi', 'kemudian', 'selama', 'untuk', 'utk', 'dari', 'pada', 'di', 'ke', 'dengan', 'dalam', 'yang', 'dan', 'atau', 'tapi',
            'saya', 'kami', 'kita', 'mereka', 'orang', 'orang-orang', 'org', 'tiba', 'kedatangan', 'berangkat', 'keberangkatan', 'perjalanan', 'waktu', 'jadwal', 'hari', 'pagi', 'malam',
            'lakukan', 'melakukan', 'ambil', 'mengambil', 'beri', 'memberikan', 'minta', 'bertanya', 'tahu', 'lihat', 'melihat', 'pakai', 'pake', 'bilang', 'kata', 'mengatakan', 'miliki', 'punya', 'ada',
            'batam', 'nongsa', 'karimun', 'dumai', 'kepri', 'johor', 'singapura', 'pelabuhan', 'terminal', 'dermaga', 'pintu', 'jalur', 'rute',
            'kapal', 'fery', 'boat', 'angkutan', 'taksi', 'ojek', 'kendaraan', 'bus', 'hotel', 'toko', 'mall', 'mal', 'restoran', 'warung', 'toilet', 'parkir', 'parkiran',
            'terlalu', 'sangat', 'cukup', 'banyak', 'terus', 'pas', 'sendiri', 'imigrasi', 'petugas', 'staf', 'bea cukai', 'porter', 'tiket', 'proses', 'sistem', 'renovasi', 'antrian', 'antrean', 'covid',
            'error', 'server', 'please', 'try', 'later', 'that', 'there', 'know', 'nya', 'yg', 'aja', 'udah', 'karena', 'kalau', 'buat',
            's', '500', '1500', 'laku', 'tuju', 'antar', 'hubung', 'guna', 'makin', 'dulu', 'bandara', 'changi', 'tanah', 'merah', 'resort', 'front', 'harbourfront', 'mega', 'megamall',
            'menyeberang', 'nyebrang', 'lewat', 'langsung', 'pengalaman', 'lainnya', 'biasanya', 'sebelumnya', 'akhirnya', 'memiliki', 'terdapat', 'tersedia', 'pilihan', 'berada', 'macam',
            'dah', 'sdh', 'tersebut', 'merupakan', 'terjadi', 'diberikan', 'kembali', 'terasa', 'terlihat', 'termasuk', 'terhadap', 'melalui', 'sehingga', 'menang', 'pekan', 'anak', 'kamu',
            'namun', 'maupun', 'malah', 'padahal', 'meski', 'meskipun', 'mulai', 'tetap', 'sama', 'bagian', 'sebuah', 'suatu', 'setiap', 'seluruh',
            'disini', 'disana', 'disitu', 'demikian', 'berikut', 'umumnya', 'memang', 'bahkan', 'hampir', 'kadang', 'sering',
            'awalnya', 'nantinya', 'sekedar', 'sekadar', 'tentang', 'antara', 'hingga', 'serta', 'yakni', 'yaitu', 'adapun', 'merasa', 'mohon'
        ]
        all_stopwords = default_stopwords + custom_stopwords
        dictionary = ArrayDictionary(all_stopwords)
        _stopword_remover = StopWordRemover(dictionary)
    return _stemmer, _stopword_remover

def preprocess_text_svm(text):
    stemmer, stopword_remover = _get_preprocessing_tools()
    text = str(text).lower()
    text = re.sub(r'[^a-z\s]', '', text).strip()
    text = stopword_remover.remove(text)
    text = stemmer.stem(text)
    return text

# ==========================================
# DATA LOADING
# ==========================================
def parse_gmaps_time(time_str):
    now = datetime(2026, 8, 24)
    if pd.isna(time_str) or str(time_str).strip() == "":
        return now
    time_str = str(time_str).lower()
    if any(x in time_str for x in ['sebulan', 'a month', '1 month']): return now - timedelta(days=30)
    if any(x in time_str for x in ['setahun', 'a year', '1 year']): return now - timedelta(days=365)
    if any(x in time_str for x in ['seminggu', 'a week', '1 week']): return now - timedelta(days=7)
    if any(x in time_str for x in ['sehari', 'a day', '1 day']): return now - timedelta(days=1)
    if any(x in time_str for x in ['sejam', 'an hour', '1 hour', 'baru saja', 'just now', 'minutes']): return now
    num_match = re.findall(r'\d+', time_str)
    if not num_match: return now
    num = int(num_match[0])
    if 'tahun' in time_str or 'year' in time_str: return now - timedelta(days=num*365)
    if 'bulan' in time_str or 'month' in time_str: return now - timedelta(days=num*30)
    if 'minggu' in time_str or 'week' in time_str: return now - timedelta(days=num*7)
    if 'hari' in time_str or 'day' in time_str: return now - timedelta(days=num)
    if 'jam' in time_str or 'hour' in time_str: return now
    return now

_df_cache = None

def load_data():
    global _df_cache
    if _df_cache is not None:
        return _df_cache
    file_path = os.path.join(DATA_PROCESSED, "final_dataset.csv")
    if not os.path.exists(file_path):
        return None
    df = pd.read_csv(file_path)
    df = df.rename(columns={'location': 'pelabuhan', 'text': 'review_text'})
    if 'rating' in df.columns:
        df['review_rating'] = df['rating'].astype(str).str.extract(r'(\d+)').astype(float)
    if 'time' in df.columns:
        df['tanggal'] = df['time'].apply(parse_gmaps_time)
        df['bulan_tahun'] = df['tanggal'].dt.to_period('M').astype(str)
    if 'aspects' in df.columns:
        def convert_to_list(val):
            if pd.isna(val) or str(val).strip() == "":
                return []
            val_str = str(val).strip()
            if val_str.startswith('[') and val_str.endswith(']'):
                try: return ast.literal_eval(val_str)
                except (ValueError, SyntaxError): return []
            else:
                return [val_str]
        df['aspects'] = df['aspects'].apply(convert_to_list)
    _df_cache = df
    return df

_svm_model = None
_tfidf_vec = None

def load_svm():
    global _svm_model, _tfidf_vec
    if _svm_model is None:
        try:
            _svm_model = joblib.load(os.path.join(MODELS_DIR, 'svm_model.pkl'))
            _tfidf_vec = joblib.load(os.path.join(MODELS_DIR, 'tfidf_vectorizer.pkl'))
        except Exception as e:
            print(f"Warning: gagal memuat model SVM: {e}")
    return _svm_model, _tfidf_vec


# ==========================================
# API ENDPOINTS
# ==========================================

@app.route('/api/data', methods=['GET'])
def get_data():
    """Return the full dataset with filters applied."""
    df = load_data()
    if df is None:
        return jsonify({'error': 'Data not found'}), 404

    # Parse filter params
    ports = request.args.get('ports', '')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')

    df_work = df.copy()

    if ports:
        port_list = [p.strip() for p in ports.split(',') if p.strip()]
        if port_list:
            df_work = df_work[df_work['pelabuhan'].isin(port_list)]

    if start_date:
        df_work = df_work[df_work['tanggal'].dt.date >= pd.to_datetime(start_date).date()]
    if end_date:
        df_work = df_work[df_work['tanggal'].dt.date <= pd.to_datetime(end_date).date()]

    # Build response
    all_ports = df['pelabuhan'].unique().tolist()
    min_date = df['tanggal'].min().strftime('%Y-%m-%d')
    max_date = df['tanggal'].max().strftime('%Y-%m-%d')

    total_reviews = len(df_work)
    avg_rating = float(df_work['review_rating'].mean()) if 'review_rating' in df_work.columns and total_reviews > 0 else 0
    ports_counted = int(df_work['pelabuhan'].nunique())

    # Popularity data
    pop_data = df_work['pelabuhan'].value_counts().reset_index()
    pop_data.columns = ['pelabuhan', 'count']

    # Scatter (quality vs volume)
    scatter_data = []
    if 'review_rating' in df_work.columns and total_reviews > 0:
        scatter_agg = df_work.groupby('pelabuhan').agg(avg_rating=('review_rating', 'mean'), volume=('review_rating', 'count')).reset_index()
        scatter_data = scatter_agg.to_dict('records')

    # Trend by month
    trend_data = []
    if 'bulan_tahun' in df_work.columns and total_reviews > 0:
        trend_agg = df_work.groupby(['bulan_tahun', 'pelabuhan']).size().reset_index(name='count')
        trend_agg = trend_agg.sort_values('bulan_tahun')
        trend_data = trend_agg.to_dict('records')

    # Aspect sentiment
    aspect_data = []
    if 'aspects' in df_work.columns and 'sentiment' in df_work.columns and total_reviews > 0:
        df_exp = df_work.explode('aspects')
        df_exp = df_exp[df_exp['aspects'].notna() & (df_exp['aspects'] != '')]
        label_mapping = {"LABEL_0": "POSITIF", "LABEL_1": "NETRAL", "LABEL_2": "NEGATIF",
                         "POSITIVE": "POSITIF", "NEUTRAL": "NETRAL", "NEGATIVE": "NEGATIF"}
        df_exp['sentiment'] = df_exp['sentiment'].replace(label_mapping)
        aspect_agg = df_exp.groupby(['pelabuhan', 'aspects', 'sentiment']).size().reset_index(name='count')
        aspect_data = aspect_agg.to_dict('records')

    # Aspect trend data
    aspect_trend_data = []
    unique_aspects = []
    if 'aspects' in df_work.columns and 'bulan_tahun' in df_work.columns and total_reviews > 0:
        df_trend_base = df_work.copy()
        df_trend_base = df_trend_base.explode('aspects')
        unique_aspects = [asp for asp in df_trend_base['aspects'].unique() if pd.notna(asp) and str(asp).strip() != ""]
        # We'll send raw data, JS will handle filtering
        if unique_aspects:
            df_trend_base = df_trend_base[df_trend_base['aspects'].isin(unique_aspects)]
            if 'review_rating' in df_trend_base.columns:
                df_trend_base['review_rating_val'] = df_trend_base['review_rating']
            aspect_trend_agg = df_trend_base.groupby(['bulan_tahun', 'pelabuhan', 'aspects']).size().reset_index(name='count')
            aspect_trend_agg = aspect_trend_agg.sort_values('bulan_tahun')
            aspect_trend_data = aspect_trend_agg.to_dict('records')

    # Heatmap data (negative reviews pivot)
    heatmap_data = {}
    if 'bulan_tahun' in df_work.columns and 'review_rating' in df_work.columns and total_reviews > 0:
        df_neg = df_work[df_work['review_rating'] <= 2]
        if not df_neg.empty:
            pivot = df_neg.pivot_table(index='pelabuhan', columns='bulan_tahun', values='review_rating', aggfunc='count', fill_value=0)
            pivot = pivot.loc[:, (pivot != 0).any(axis=0)]
            heatmap_data = {
                'ports': pivot.index.tolist(),
                'months': pivot.columns.tolist(),
                'values': pivot.values.tolist()
            }

    # WordCloud data
    wordcloud_words = {}
    teks_kolom = 'wordcloud_text' if 'wordcloud_text' in df_work.columns else 'final_text' if 'final_text' in df_work.columns else 'review_text' if 'review_text' in df_work.columns else None
    if teks_kolom and total_reviews > 0:
        semua_teks = " ".join(df_work[teks_kolom].dropna().astype(str))
        whitelist_kata = set([
            'bagus', 'baik', 'nyaman', 'bersih', 'kotor', 'ramah', 'cepat', 'lambat', 'mahal', 'murah',
            'rapi', 'semrawut', 'panas', 'dingin', 'luas', 'sempit', 'aman', 'buruk', 'jelek',
            'mantap', 'keren', 'parah', 'lama', 'mudah', 'susah', 'ribet', 'terbaik', 'memadai',
            'puas', 'kecewa', 'tertib', 'sigap', 'lelet', 'pesing', 'wangi', 'terang', 'gelap',
            'sepi', 'ramai', 'penuh', 'sesak',
            'fasilitas', 'pelayanan', 'tiket', 'parkir', 'parkiran', 'toilet', 'wc', 'ac', 'kipas',
            'kursi', 'ruang', 'ruangan', 'tunggu', 'imigrasi', 'petugas', 'staf', 'keamanan',
            'akses', 'jalan', 'jembatan', 'tangga', 'lift', 'eskalator', 'taksi', 'ojek', 'mobil',
            'motor', 'transportasi', 'makanan', 'minuman', 'kantin', 'kafe', 'harga', 'bangunan',
            'gedung', 'loket', 'antrian', 'sistem', 'jadwal', 'boarding',
            'perbaiki', 'perbaikan', 'tingkatkan', 'bersihkan', 'tambah', 'ganti', 'renovasi',
            'tertata', 'teratur'
        ])
        filtered_words = [kata for kata in semua_teks.lower().split() if kata in whitelist_kata]
        word_freq = {}
        for w in filtered_words:
            word_freq[w] = word_freq.get(w, 0) + 1
        wordcloud_words = word_freq

    # Insights
    insights = {}
    df_negatif_insight = df_work[df_work['review_rating'] <= 2] if 'review_rating' in df_work.columns else pd.DataFrame()
    if total_reviews > 0:
        insights['total_reviews'] = total_reviews
        insights['total_negative'] = len(df_negatif_insight)
        insights['avg_rating'] = round(avg_rating, 1)

        if not df_negatif_insight.empty:
            keluhan_per_port = df_negatif_insight['pelabuhan'].value_counts()
            total_per_port = df_work['pelabuhan'].value_counts()
            rasio_keluhan = (keluhan_per_port / total_per_port * 100).dropna().sort_values(ascending=False)
            port_terbanyak = keluhan_per_port.index[0]
            jml = int(keluhan_per_port.iloc[0])
            rasio = float(rasio_keluhan.get(port_terbanyak, 0))
            insights['top_complaint_port'] = port_terbanyak
            insights['top_complaint_count'] = jml
            insights['top_complaint_ratio'] = round(rasio, 1)

            if 'aspects' in df_work.columns:
                df_aspek_neg = df_negatif_insight.copy()
                if isinstance(df_aspek_neg['aspects'].iloc[0], list):
                    df_aspek_neg = df_aspek_neg.explode('aspects')
                df_aspek_neg = df_aspek_neg[df_aspek_neg['aspects'].notna() & (df_aspek_neg['aspects'] != "")]
                if not df_aspek_neg.empty:
                    top_asp = df_aspek_neg['aspects'].value_counts().index[0]
                    top_asp_count = int(df_aspek_neg['aspects'].value_counts().iloc[0])
                    port_top = df_aspek_neg[df_aspek_neg['aspects'] == top_asp]['pelabuhan'].value_counts().index[0]
                    port_top_cnt = int(df_aspek_neg[df_aspek_neg['aspects'] == top_asp]['pelabuhan'].value_counts().iloc[0])
                    insights['top_aspect'] = top_asp
                    insights['top_aspect_count'] = top_asp_count
                    insights['top_aspect_port'] = port_top
                    insights['top_aspect_port_count'] = port_top_cnt

        # Sample negative reviews
        sample_neg = []
        if not df_negatif_insight.empty and 'review_text' in df_negatif_insight.columns:
            df_sample = df_negatif_insight.sort_values('tanggal', ascending=False).head(2)
            for _, row in df_sample.iterrows():
                tgl_str = row['tanggal'].strftime('%b %Y') if pd.notna(row['tanggal']) else "-"
                rating_val = int(row['review_rating']) if pd.notna(row['review_rating']) else 1
                sample_neg.append({
                    'port': row['pelabuhan'],
                    'date': tgl_str,
                    'rating': rating_val,
                    'text': str(row['review_text'])[:500]
                })
        insights['sample_negative'] = sample_neg

    # Raw table data
    cols_to_show = ['pelabuhan', 'tanggal', 'review_text', 'review_rating']
    available_cols = [c for c in cols_to_show if c in df_work.columns]
    if 'aspects' in df_work.columns:
        available_cols.append('aspects')
    df_table = df_work[available_cols].copy()
    if 'tanggal' in df_table.columns:
        df_table['tanggal'] = df_table['tanggal'].dt.strftime('%Y-%m-%d')
    if 'aspects' in df_table.columns:
        df_table['aspects'] = df_table['aspects'].apply(lambda x: ', '.join(x) if isinstance(x, list) else str(x))
    # Limit rows for performance
    table_data = df_table.head(500).to_dict('records')

    return jsonify({
        'all_ports': all_ports,
        'min_date': min_date,
        'max_date': max_date,
        'kpi': {
            'total_reviews': total_reviews,
            'avg_rating': round(avg_rating, 1),
            'ports_counted': ports_counted
        },
        'popularity': pop_data.to_dict('records'),
        'scatter': scatter_data,
        'trend': trend_data,
        'aspect_sentiment': aspect_data,
        'aspect_trend': aspect_trend_data,
        'unique_aspects': unique_aspects,
        'heatmap': heatmap_data,
        'wordcloud_words': wordcloud_words,
        'insights': insights,
        'table': table_data
    })


@app.route('/api/predict', methods=['POST'])
def predict_sentiment():
    """Predict sentiment using SVM model."""
    svm_model, tfidf_vec = load_svm()
    if svm_model is None or tfidf_vec is None:
        return jsonify({'error': 'Model SVM atau TF-IDF belum tersedia.'}), 404

    data = request.get_json()
    user_input = data.get('text', '').strip()
    if not user_input:
        return jsonify({'error': 'Teks kosong.'}), 400

    # Translate
    try:
        from deep_translator import GoogleTranslator
        teks_terjemahan = GoogleTranslator(source='auto', target='id').translate(user_input)
    except:
        teks_terjemahan = user_input

    teks_bersih = preprocess_text_svm(teks_terjemahan)
    vektor_teks = tfidf_vec.transform([teks_bersih])
    raw_prediksi = svm_model.predict(vektor_teks)[0]

    prob_pos, prob_neu, prob_neg = 0.0, 0.0, 0.0
    has_proba = hasattr(svm_model, "predict_proba")

    if has_proba:
        probabilitas = svm_model.predict_proba(vektor_teks)[0]
        kelas_model = svm_model.classes_
        for i, kls in enumerate(kelas_model):
            kls_str = str(kls).upper()
            if kls_str == "POSITIF" or kls in [1, 2]:
                prob_pos = float(probabilitas[i])
            elif kls_str == "NEGATIF" or kls in [-1, 0]:
                prob_neg = float(probabilitas[i])
            else:
                prob_neu = float(probabilitas[i])
    else:
        prediksi_str = str(raw_prediksi).upper()
        if prediksi_str == "POSITIF": prob_pos = 1.0
        elif prediksi_str == "NEGATIF": prob_neg = 1.0
        else: prob_neu = 1.0

    prediksi = str(raw_prediksi).upper()
    if prediksi in ["0", "-1"]: prediksi = "NEGATIF"
    elif prediksi in ["1"]: prediksi = "NETRAL"
    elif prediksi in ["2"]: prediksi = "POSITIF"

    return jsonify({
        'prediction': prediksi,
        'processed_text': teks_bersih,
        'probabilities': {
            'positif': round(prob_pos, 4),
            'netral': round(prob_neu, 4),
            'negatif': round(prob_neg, 4)
        },
        'has_proba': has_proba
    })


@app.route('/api/eval_metrics', methods=['GET'])
def get_eval_metrics():
    """Return model evaluation metrics."""
    metrics_path = os.path.join(MODELS_DIR, 'eval_metrics.json')
    if not os.path.exists(metrics_path):
        return jsonify({'error': 'File eval_metrics.json belum tersedia.'}), 404
    with open(metrics_path, 'r') as f:
        metrics = json.load(f)
    return jsonify(metrics)


@app.route('/api/reload', methods=['POST'])
def reload_data():
    """Clear cached data and reload."""
    global _df_cache
    _df_cache = None
    load_data()
    return jsonify({'status': 'ok', 'message': 'Data reloaded'})


# Serve the HTML frontend
@app.route('/')
def serve_frontend():
    return send_file(os.path.join(BASE_DIR, 'index.html'))

@app.route('/style.css')
def serve_css():
    return send_file(os.path.join(BASE_DIR, 'style.css'))

@app.route('/script.js')
def serve_js():
    return send_file(os.path.join(BASE_DIR, 'script.js'))


if __name__ == '__main__':
    print("="*50)
    print("  Dashboard API Server")
    print("  Buka http://localhost:5000 di browser")
    print("="*50)
    app.run(debug=True, port=5000)
