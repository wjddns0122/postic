import React, { lazy, Suspense } from 'react'
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

// 직원용 ERP는 따로 받는다 (손님 화면 첫 로딩에 포함되지 않게). 손님용 실시간 조회(LiveProvider)도 돌리지 않는다
const ErpApp = lazy(() => import('./erp/ErpApp'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/erp/*"
          element={
            <Suspense fallback={null}>
              <ErpApp />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <LiveProvider>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/hanger/:id" element={<Hanger />} />
                <Route path="/p/:id" element={<ProductPage />} />
                <Route path="/order/:id" element={<OrderPage />} />
                <Route path="/fitting" element={<FittingPage />} />
                <Route path="/pickup" element={<PickupPage />} />
                <Route path="/admin" element={<Admin />} />
              </Routes>
            </LiveProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
