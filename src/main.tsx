import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { LiveProvider } from './live'
import Home from './pages/Home'
import Hanger from './pages/Hanger'
import ProductPage from './pages/Product'
import OrderPage from './pages/Order'
import Admin from './pages/Admin'
import { FittingPage, PickupPage } from './pages/Places'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LiveProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/hanger/:id" element={<Hanger />} />
          <Route path="/p/:id" element={<ProductPage />} />
          <Route path="/order/:id" element={<OrderPage />} />
          <Route path="/fitting" element={<FittingPage />} />
          <Route path="/pickup" element={<PickupPage />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </LiveProvider>
  </React.StrictMode>,
)
