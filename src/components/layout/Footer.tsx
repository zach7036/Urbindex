export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Urbindex</span>
            {' '}· US City Intelligence Platform
          </div>
          <div className="footer-links">
            <a href="https://census.gov" target="_blank" rel="noopener noreferrer">Census Data</a>
            <a href="https://www.bls.gov" target="_blank" rel="noopener noreferrer">BLS</a>
            <a href="https://www.noaa.gov" target="_blank" rel="noopener noreferrer">NOAA</a>
          </div>
          <div>
            Data sourced from US Census Bureau, BLS, NOAA, FBI, EPA &amp; more
          </div>
        </div>
      </div>
    </footer>
  );
}
