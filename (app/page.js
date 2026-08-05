'use client';
import { useState } from 'react';

export default function Home() {
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [userProfile, setUserProfile] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobTitle, location, userProfile }),
    });

    const data = await res.json();
    setResults(data.results);
    setLoading(false);
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>LinkedIn Job Search Automation</h1>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label>Job Title:</label>
          <input 
            type="text" 
            value={jobTitle} 
            onChange={(e) => setJobTitle(e.target.value)} 
            placeholder="e.g. React Developer"
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <div>
          <label>Location:</label>
          <input 
            type="text" 
            value={location} 
            onChange={(e) => setLocation(e.target.value)} 
            placeholder="e.g. Remote / Egypt"
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <div>
          <label>Your Profile / CV Summary:</label>
          <textarea 
            value={userProfile} 
            onChange={(e) => setUserProfile(e.target.value)} 
            placeholder="Paste your key skills or LinkedIn bio here..."
            required
            style={{ width: '100%', padding: '8px', height: '100px' }}
          />
        </div>

        <button type="submit" disabled={loading} style={{ padding: '10px 15px', cursor: 'pointer' }}>
          {loading ? 'Searching & Scoring Jobs...' : 'Find Jobs'}
        </button>
      </form>

      {results && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Matches Found:</h2>
          <pre>{JSON.stringify(results, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}
