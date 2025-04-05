import React from 'react';
import { HashRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './Dashboard';
import CSVUploader from './CSVUploader';
import InventoryManager from './InventoryManager';
import './App.css';

function App() {
    return (
        <Router>
            <div className="app-container">
                <nav className="nav-bar">
                    <ul>
                        <li>
                            <Link to="/">Dashboard</Link>
                        </li>
                        <li>
                            <Link to="/csv-uploader">CSV Uploader</Link>
                        </li>
                        <li>
                            <Link to="/inventory-manager">Inventory Manager</Link>
                        </li>
                    </ul>
                </nav>
                <div className="content">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/csv-uploader" element={<CSVUploader />} />
                        <Route path="/inventory-manager" element={<InventoryManager />} />
                    </Routes>
                </div>
            </div>
        </Router>
    );
}

export default App;
