function Navbar({ activeTab, onTabChange }) {
  const tabs = [
    { id: "builder", label: "Model Builder" },
    { id: "results", label: "Results" },
    { id: "test", label: "Test Model" },
  ];

  return (
    <nav className="navbar">
      <div className="logo">SpeakML</div>

      <div className="nav-links">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "nav-link active" : "nav-link"}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default Navbar;
