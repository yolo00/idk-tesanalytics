"""
app.py — entry point Streamlit.

Dashboard Streamlit versi lama: legacy_app.py
"""
import os
import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(
    page_title="Dashboard Analisis Sentimen Pelabuhan",
    layout="wide",
    initial_sidebar_state="collapsed",
)
st.markdown("""
<style>
    #MainMenu, footer, header {visibility: hidden;}
    .block-container {padding: 0 !important; max-width: 100% !important;}
    iframe {border: none !important; width: 100% !important;}
</style>
""", unsafe_allow_html=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_dashboard = components.declare_component(
    "port_dashboard", path=os.path.join(BASE_DIR, "frontend")
)


@st.cache_resource(show_spinner="Memuat backend...")
def _client():
    from api_server import app as flask_app
    return flask_app.test_client()


@st.cache_data(show_spinner=False, ttl=3600)
def _get(path: str):
    r = _client().get(path)
    return r.status_code, r.get_data(as_text=True)


def _handle(req: dict) -> dict:
    path, method = req["path"], req.get("method", "GET").upper()
    if method == "GET":
        status, body = _get("/api" + path)
    else:
        if path.startswith("/reload"):
            _get.clear()
        r = _client().open("/api" + path, method=method, data=req.get("body"),
                           content_type="application/json")
        status, body = r.status_code, r.get_data(as_text=True)
    return {"status": status, "body": body}


responses = st.session_state.setdefault("rpc_responses", {})
value = _dashboard(responses=responses, key="port_dashboard", default=None)

if value:
    reqs = value.get("reqs", [])
    ids = {r["id"] for r in reqs}
    for k in [k for k in responses if k not in ids]:
        del responses[k]
    new = [r for r in reqs if r["id"] not in responses]
    for r in new:
        responses[r["id"]] = _handle(r)
    if new:
        st.rerun()
