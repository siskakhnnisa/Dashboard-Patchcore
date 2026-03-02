import React, { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function FODSnapshotGallery({ enabled }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setSnapshots([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    async function fetchSnapshots() {
      try {
        const res = await fetch(`${API_BASE}/fod-snapshots/`); // pastikan ada slash di akhir
        if (!res.ok) {
          let msg = `Gagal fetch data snapshot: ${res.status}`;
          try {
            const err = await res.text();
            msg += `\n${err}`;
          } catch {}
          throw new Error(msg);
        }
        const data = await res.json();
        setSnapshots(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSnapshots();
  }, [enabled]);

  if (!enabled) return <div>Galeri snapshot akan muncul setelah deteksi berjalan.</div>;
  if (loading) return <div>Loading snapshots...</div>;
  if (error) return <div style={{color:'red'}}>Error: {error}</div>;
  if (!snapshots.length) return <div>Tidak ada snapshot FOD.</div>;

  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:16}}>
      {snapshots.map(snap => (
        <div key={snap.id} style={{border:'1px solid #ccc',borderRadius:8,padding:8,width:220}}>
          <img
            src={`${API_BASE}/snapshots/${snap.image_path}`}
            alt={`FOD Snapshot ${snap.id}`}
            style={{width:'100%',borderRadius:4,marginBottom:8}}
            onError={e => {
              e.target.onerror = null;
              e.target.src = 'https://via.placeholder.com/220x120?text=Snapshot+Not+Found';
            }}
          />
          <div><b>Waktu:</b> {new Date(snap.timestamp).toLocaleString()}</div>
          <div><b>Frame:</b> {snap.frame_number}</div>
          <div><b>Confidence:</b> {snap.confidence}</div>
          <div><b>Label:</b> {snap.label}</div>
        </div>
      ))}
    </div>
  );
}
