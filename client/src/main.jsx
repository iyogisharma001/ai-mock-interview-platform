import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import Home from './pages/Home.jsx';
import Interview from './pages/Interview.jsx';
import Report from './pages/Report.jsx';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/interview/:id" element={<Interview />} />
      <Route path="/report/:id" element={<Report />} />
      <Route path="*" element={<Home />} />
    </Routes>
  </BrowserRouter>,
);
