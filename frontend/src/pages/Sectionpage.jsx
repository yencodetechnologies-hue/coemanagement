// pages/SectionPage.jsx  – stats + table page for any menu that has no dedicated screen yet
import React from 'react';

const sectionData = {
  Dashboard: {
    stats: [['Registered students', '5,423', '+16% this month', 1], ['Papers this session', '148', '12 not yet scheduled', 0], ['Hall tickets issued', '4,820', '94% of applicants', 1]],
    title: 'Student directory',
    columns: ['Student name', 'Register no.', 'Programme', 'Email', 'Campus', 'Status'],
    rows: [
      ['Jane Cooper', '22CS1041', 'B.Tech IT', 'jane@uni.edu', 'Main', 'Active'],
      ['Floyd Miles', '22MA1017', 'B.Sc Mathematics', 'floyd@uni.edu', 'North', 'Inactive'],
      ['Ronald Richards', '21CS0988', 'B.Tech CSE', 'ronald@uni.edu', 'Main', 'Inactive'],
      ['Marvin McKinney', '22PH1102', 'B.Sc Physics', 'marvin@uni.edu', 'North', 'Active'],
      ['Jerome Bell', '22CS1230', 'B.Tech CSE', 'jerome@uni.edu', 'Main', 'Active'],
    ],
  },
  'Student profile': {
    stats: [['Undergraduates', '4,200', '+12%', 1], ['Postgraduates', '1,223', '+5%', 1], ['Graduating batch', '980', 'Final year', 1]],
    title: 'Student records',
    columns: ['Register no.', 'Full name', 'Programme', 'Year', 'Advisor', 'Status'],
    rows: [
      ['22CS1041', 'Jane Cooper', 'B.Tech IT', 'Year 3', 'Dr. Robert Fox', 'Active'],
      ['22MA1017', 'Floyd Miles', 'B.Sc Mathematics', 'Year 2', 'Prof. Esther Howard', 'Active'],
      ['21CS0988', 'Ronald Richards', 'B.Tech CSE', 'Year 4', 'Dr. Cameron Williamson', 'Inactive'],
    ],
  },
  'Attendance & internal marks': {
    stats: [['Average attendance', '91.4%', '+2.1%', 1], ['Internal marks average', '18.2 / 20', 'Stable', 1], ['Below 75% attendance', '38', 'Needs review', 0]],
    title: 'Attendance and internal marks',
    columns: ['Student name', 'Subject', 'Classes attended', 'Attendance', 'Internal', 'Status'],
    rows: [
      ['Jane Cooper', 'Full stack development', '45 / 48', '93.7%', '19 / 20', 'Active'],
      ['Floyd Miles', 'Mathematics', '40 / 48', '83.3%', '16 / 20', 'Active'],
      ['Ronald Richards', 'Physics', '32 / 48', '66.6%', '12 / 20', 'Inactive'],
    ],
  },
  'Application & hall ticket': {
    stats: [['Applications received', '5,100', 'Window closed', 1], ['Hall tickets downloaded', '4,820', '94%', 1], ['Pending print', '280', 'Send to press', 0]],
    title: 'Hall ticket issue',
    columns: ['Ticket no.', 'Student name', 'Batch', 'Issued on', 'Verified by', 'Status'],
    rows: [
      ['HT-501', 'Jane Cooper', 'Batch 2026-A', '20 Sep 2026', 'System', 'Active'],
      ['HT-502', 'Floyd Miles', 'Batch 2026-B', '20 Sep 2026', 'System', 'Active'],
      ['HT-503', 'Ronald Richards', 'Batch 2026-A', '21 Sep 2026', 'Admin desk', 'Inactive'],
    ],
  },
};

const fallback = (name) => ({
  stats: [['Records', '—', 'No data yet', 1], ['Pending', '—', 'Nothing to review', 1], ['Last updated', 'Today2', '', 1]],
  title: name, columns: ['Name', 'Detail', 'Updated', 'Owner', 'Notes', 'Status'], rows: [],
});

function DataView({ data }) {
  return (
    <>
      <div className="stats-grid">
        {data.stats.map(([label, value, note, good]) => (
          <div className="stat-card" key={label}>
            <p className="stat-label">{label}</p>
            <p className="stat-value">{value}</p>
            {note && <p className={`stat-note ${good ? 'good' : 'warn'}`}>{note}</p>}
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">{data.title}</h2>
          <input className="field search" placeholder="Search records" />
        </div>
        <div className="table-responsive">
          <table className="custom-table">
            <thead><tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr><td colSpan={6} className="empty">Nothing here yet. Records will appear once this session has data.</td></tr>
              )}
              {data.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} data-label={data.columns[j]}>
                      {j === row.length - 1
                        ? <span className={`badge ${cell.toLowerCase()}`}>{cell}</span>
                        : j === 0 ? <strong>{cell}</strong> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}


export default function SectionPage({ name }) {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{name}</h1>
      </div>
      <DataView data={sectionData[name] || fallback(name)} />
    </>
  );
}