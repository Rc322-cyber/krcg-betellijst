import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import './App.css'
import { auth, db, isFirebaseConfigured } from './firebase.js'

const ADMIN_EMAILS = ['rafke89@gmail.com']
const LEGACY_COLLECTION = 'krcg'
const LEGACY_DOCUMENT = 'bestellijst'
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
const PAYMENT_METHODS = ['Payconiq', 'Overschrijving', 'Cash']

const createId = () => crypto.randomUUID()

const createItem = (overrides = {}) => ({
  id: createId(),
  productId: '',
  name: '',
  color: '',
  size: '',
  quantity: '1',
  price: '',
  ...overrides,
})

const createOrder = (overrides = {}) => ({
  id: createId(),
  name: '',
  paymentStatus: 'Niet betaald',
  paymentMethod: 'Payconiq',
  paidAmount: '',
  pickedUp: false,
  items: [createItem()],
  source: 'admin',
  ...overrides,
})

const createProduct = (overrides = {}) => ({
  id: createId(),
  name: '',
  price: '',
  colors: [],
  sizes: [...SIZES],
  active: true,
  imageUrl: '',
  description: '',
  category: '',
  ...overrides,
})

const createCartLine = (product) =>
  createItem({
    productId: product?.id ?? '',
    name: product?.name ?? '',
    product: product?.name ?? '',
    color: product?.colors?.[0] ?? '',
    size: product?.sizes?.[0] ?? '',
    quantity: '1',
    price: product?.price ?? '',
  })

const formatCurrency = (value) =>
  new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)

const parseNumber = (value) => {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : 0
}

const normalizeItem = (item = {}) =>
  createItem({
    id: item.id || createId(),
    productId: item.productId ?? '',
    name: item.name ?? item.product ?? '',
    product: item.product ?? item.name ?? '',
    color: item.color ?? '',
    size: item.size ?? '',
    quantity: String(item.quantity ?? '1'),
    price: String(item.price ?? ''),
    lijnTotaal: String(item.lijnTotaal ?? ''),
  })

const normalizeOrder = (order = {}, id = order.id) =>
  createOrder({
    id: id || createId(),
    name: order.name ?? '',
    paymentStatus: order.paymentStatus ?? 'Niet betaald',
    paymentMethod: order.paymentMethod ?? order.paymentStatus ?? 'Payconiq',
    paidAmount: String(order.paidAmount ?? ''),
    pickedUp: Boolean(order.pickedUp),
    datum: order.datum ?? order.createdAt ?? null,
    createdAt: order.createdAt ?? null,
    updatedAt: order.updatedAt ?? null,
    items:
      Array.isArray(order.items) && order.items.length > 0
        ? order.items.map(normalizeItem)
        : [createItem()],
    source: order.source ?? 'admin',
  })

const normalizeProduct = (product = {}, id = product.id) =>
  createProduct({
    id: id || createId(),
    name: product.name ?? '',
    price: String(product.price ?? ''),
    colors: Array.isArray(product.colors) ? product.colors : [],
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    active: product.active !== false,
    imageUrl: product.imageUrl ?? '',
    description: product.description ?? '',
    category: product.category ?? '',
  })

const serializeOrder = (order) => ({
  name: order.name.trim(),
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  paidAmount: String(order.paidAmount ?? ''),
  pickedUp: Boolean(order.pickedUp),
  items: order.items.map((item) => ({
    id: item.id,
    productId: item.productId ?? '',
    name: item.name.trim(),
    product: (item.product ?? item.name).trim(),
    color: item.color.trim(),
    size: item.size.trim(),
    quantity: String(item.quantity ?? '1'),
    price: String(item.price ?? ''),
    lijnTotaal: String(getItemTotal(item)),
  })),
  source: order.source ?? 'admin',
})

const serializeProduct = (product) => ({
  name: product.name.trim(),
  price: String(product.price ?? ''),
  colors: product.colors.map((color) => color.trim()).filter(Boolean),
  sizes: product.sizes.map((size) => size.trim()).filter(Boolean),
  active: Boolean(product.active),
  imageUrl: product.imageUrl.trim(),
  description: product.description.trim(),
  category: product.category.trim(),
})

const getItemTotal = (item) => parseNumber(item.quantity) * parseNumber(item.price)
const getOrderTotal = (order) =>
  order.items.reduce((total, item) => total + getItemTotal(item), 0)
const getPaidAmount = (order) => parseNumber(order.paidAmount)
const getOutstandingAmount = (order) =>
  Math.max(getOrderTotal(order) - getPaidAmount(order), 0)

const formatDate = (value) => {
  const date = value?.toDate?.() ?? null
  if (!date) return 'Geen datum'

  return new Intl.DateTimeFormat('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function useAuthState() {
  const [state, setState] = useState({ loading: Boolean(auth), user: null })

  useEffect(() => {
    if (!auth) {
      return undefined
    }

    return onAuthStateChanged(auth, (user) => {
      setState({ loading: false, user })
    })
  }, [])

  return state
}

function useAdminAccess(user) {
  const [firestoreAdmin, setFirestoreAdmin] = useState({ email: '', isAdmin: false, checked: false })

  useEffect(() => {
    let active = true

    if (!user?.email) {
      return undefined
    }

    if (!isFirebaseConfigured || !db) {
      return undefined
    }

    const fallbackAdmin = ADMIN_EMAILS.includes(user.email)

    getDoc(doc(db, 'admins', user.email))
      .then((adminDoc) => {
        if (!active) return
        setFirestoreAdmin({
          email: user.email,
          isAdmin: fallbackAdmin || (adminDoc.exists() && adminDoc.data()?.active !== false),
          checked: true,
        })
      })
      .catch(() => {
        if (!active) return
        setFirestoreAdmin({ email: user.email, isAdmin: false, checked: true })
      })

    return () => {
      active = false
    }
  }, [user])

  const fallbackAdmin = Boolean(user?.email && ADMIN_EMAILS.includes(user.email))
  const checkedCurrentUser = Boolean(user?.email && firestoreAdmin.email === user.email && firestoreAdmin.checked)

  return {
    loading: Boolean(user?.email && isFirebaseConfigured && !fallbackAdmin && !checkedCurrentUser),
    isAdmin: fallbackAdmin || Boolean(user?.email && firestoreAdmin.email === user.email && firestoreAdmin.isAdmin),
  }
}

function useProducts(includeInactive = false) {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState(isFirebaseConfigured ? 'Laden...' : 'Firebase instellen')
  const [error, setError] = useState(
    isFirebaseConfigured ? '' : 'Firebase is niet volledig ingesteld. Controleer je .env-bestand.',
  )

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      return undefined
    }

    const productsQuery = includeInactive
      ? query(collection(db, 'products'), orderBy('name'))
      : query(collection(db, 'products'), where('active', '==', true), orderBy('name'))

    return onSnapshot(
      productsQuery,
      (snapshot) => {
        setProducts(snapshot.docs.map((productDoc) => normalizeProduct(productDoc.data(), productDoc.id)))
        setStatus(snapshot.metadata.hasPendingWrites ? 'Opslaan...' : 'Online gedeeld')
        setError('')
      },
      (snapshotError) => {
        setStatus('Lezen mislukt')
        setError(snapshotError instanceof Error ? snapshotError.message : 'Producten laden mislukt.')
      },
    )
  }, [includeInactive])

  return { products, status, error }
}

function useOrders() {
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState(isFirebaseConfigured ? 'Laden...' : 'Firebase instellen')
  const [error, setError] = useState(
    isFirebaseConfigured ? '' : 'Firebase is niet volledig ingesteld. Controleer je .env-bestand.',
  )
  const migrationCheckedRef = useRef(false)

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      return undefined
    }

    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))

    return onSnapshot(
      ordersQuery,
      async (snapshot) => {
        const nextOrders = snapshot.docs.map((orderDoc) => normalizeOrder(orderDoc.data(), orderDoc.id))
        setOrders(nextOrders)
        setStatus(snapshot.metadata.hasPendingWrites ? 'Opslaan...' : 'Online gedeeld')
        setError('')

        if (!migrationCheckedRef.current && !snapshot.metadata.fromCache) {
          migrationCheckedRef.current = true
          if (nextOrders.length === 0) {
            await migrateLegacyOrders()
          }
        }
      },
      (snapshotError) => {
        setStatus('Lezen mislukt')
        setError(snapshotError instanceof Error ? snapshotError.message : 'Bestellingen laden mislukt.')
      },
    )
  }, [])

  return { orders, status, error }
}

async function migrateLegacyOrders() {
  const settingsRef = doc(db, 'settings', 'legacyOrderMigration')
  const settingsSnap = await getDoc(settingsRef)

  if (settingsSnap.exists()) {
    return
  }

  const legacySnap = await getDoc(doc(db, LEGACY_COLLECTION, LEGACY_DOCUMENT))
  const legacyPeople = legacySnap.data()?.people

  if (!Array.isArray(legacyPeople) || legacyPeople.length === 0) {
    await setDoc(settingsRef, { checkedAt: serverTimestamp(), migratedCount: 0 })
    return
  }

  const legacyOrders = legacyPeople
    .map((person) => normalizeOrder({ ...person, source: 'legacy' }))
    .filter((order) => order.name.trim() || order.items.some((item) => item.name.trim()))

  const batch = writeBatch(db)
  legacyOrders.forEach((order) => {
    const orderRef = doc(collection(db, 'orders'))
    batch.set(orderRef, {
      ...serializeOrder(order),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  batch.set(settingsRef, {
    checkedAt: serverTimestamp(),
    migratedCount: legacyOrders.length,
    source: `${LEGACY_COLLECTION}/${LEGACY_DOCUMENT}`,
  })
  await batch.commit()
}

function AdminRoute({ children }) {
  const { loading, user } = useAuthState()
  const adminAccess = useAdminAccess(user)

  if (loading || adminAccess.loading) {
    return <Shell title="Admin laden" intro="Authenticatie controleren..." />
  }

  if (!user) {
    return <LoginPage />
  }

  if (!adminAccess.isAdmin) {
    return (
      <Shell
        title="Geen toegang"
        intro="Je bent ingelogd, maar dit account heeft geen adminrechten."
        actions={
          <button type="button" className="secondary-button" onClick={() => signOut(auth)}>
            Uitloggen
          </button>
        }
      />
    )
  }

  return children
}

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { loading, user } = useAuthState()
  const adminAccess = useAdminAccess(user)
  const [email, setEmail] = useState('rafke89@gmail.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const from = location.state?.from?.pathname || '/admin'

  useEffect(() => {
    if (!loading && !adminAccess.loading && user && adminAccess.isAdmin) {
      navigate(from, { replace: true })
    }
  }, [adminAccess.isAdmin, adminAccess.loading, from, loading, navigate, user])

  if (!loading && !adminAccess.loading && user && !adminAccess.isAdmin) {
    return (
      <Shell
        title="Geen toegang"
        intro="Je bent ingelogd, maar dit account heeft geen adminrechten."
        actions={
          <button type="button" className="secondary-button" onClick={() => signOut(auth)}>
            Uitloggen
          </button>
        }
      />
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      navigate(from, { replace: true })
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Inloggen mislukt.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Shell title="Admin login" intro="Log in met een toegestaan admin e-mailadres.">
      <form className="login-card" onSubmit={handleSubmit}>
        <label className="field">
          <span>E-mail</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
        <label className="field">
          <span>Wachtwoord</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </label>
        {error ? <p className="sync-status sync-status-error">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={submitting || !isFirebaseConfigured}>
          {submitting ? 'Inloggen...' : 'Inloggen'}
        </button>
      </form>
    </Shell>
  )
}

function Shell({ title, intro, children, actions, syncStatus, error }) {
  return (
    <main className="app-shell">
      <section className="page-card">
        <div className="page-header">
          <div>
            <p className="eyebrow">KRCG bestellijst</p>
            <h1>{title}</h1>
            {intro ? <p className="intro">{intro}</p> : null}
            {syncStatus ? <p className="sync-status">{syncStatus}</p> : null}
            {error ? <p className="sync-status sync-status-error">{error}</p> : null}
          </div>
          {actions ? <div className="header-actions">{actions}</div> : null}
        </div>
        {children}
      </section>
    </main>
  )
}

function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [statusFilter, setStatusFilter] = useState('openstaand')
  const [searchTerm, setSearchTerm] = useState('')
  const [printMode, setPrintMode] = useState('list')
  const { orders, status: orderStatus, error: orderError } = useOrders()
  const { products, status: productStatus, error: productError } = useProducts(true)
  const syncStatus = activeTab === 'producten' ? productStatus : orderStatus
  const syncError = activeTab === 'producten' ? productError : orderError

  useEffect(() => {
    const handleAfterPrint = () => setPrintMode('list')
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [])

  const handlePrint = (nextPrintMode) => {
    setPrintMode(nextPrintMode)
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }

  const addOrder = async () => {
    await addDoc(collection(db, 'orders'), {
      ...serializeOrder(createOrder()),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const actions = (
    <>
      <button type="button" className="secondary-button" onClick={() => signOut(auth)}>
        Uitloggen
      </button>
      {activeTab === 'bestellingen' ? (
        <>
          <button type="button" className="secondary-button" onClick={() => handlePrint('list')}>
            Bestellijst afdrukken
          </button>
          <button type="button" className="primary-button" onClick={addOrder} disabled={!isFirebaseConfigured}>
            Bestelling toevoegen
          </button>
        </>
      ) : null}
      {activeTab === 'overzicht' ? (
        <button type="button" className="secondary-button" onClick={() => handlePrint('summary')}>
          Overzicht afdrukken
        </button>
      ) : null}
    </>
  )

  return (
    <main className={`app-shell print-mode-${printMode}`}>
      <section className="page-card">
        <div className="page-header">
          <div>
            <p className="eyebrow">Beveiligde admin</p>
            <h1>Webshop beheren</h1>
            <p className="intro">Beheer producten, publieke bestellingen, betalingen, afhalingen en printlijsten.</p>
            <p className="sync-status">{syncStatus}</p>
            {syncError ? <p className="sync-status sync-status-error">{syncError}</p> : null}
          </div>
          <div className="header-actions">{actions}</div>
        </div>

        <div className="tabs-row">
          {['dashboard', 'bestellingen', 'producten', 'overzicht'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab-button ${activeTab === tab ? 'tab-button-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' ? <Dashboard orders={orders} products={products} setActiveTab={setActiveTab} /> : null}
        {activeTab === 'bestellingen' ? (
          <OrdersAdmin
            orders={orders}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            setActiveTab={setActiveTab}
          />
        ) : null}
        {activeTab === 'producten' ? <ProductsAdmin products={products} /> : null}
        {activeTab === 'overzicht' ? <Overview orders={orders} onPrint={() => handlePrint('summary')} /> : null}
        <PrintSheets orders={orders} statusFilter={statusFilter} />
      </section>
    </main>
  )
}

function Dashboard({ orders, products, setActiveTab }) {
  const revenue = orders.reduce((total, order) => total + getOrderTotal(order), 0)
  const outstanding = orders.reduce((total, order) => total + getOutstandingAmount(order), 0)
  const pickedUp = orders.filter((order) => order.pickedUp).length
  const notPickedUp = orders.length - pickedUp
  const activeProducts = products.filter((product) => product.active).length

  return (
    <section className="dashboard-section">
      <div className="dashboard-grid">
        <SummaryStat label="Bestellingen" value={orders.length} />
        <SummaryStat label="Omzet" value={formatCurrency(revenue)} />
        <SummaryStat label="Openstaand" value={formatCurrency(outstanding)} />
        <SummaryStat label="Afgehaald" value={pickedUp} />
        <SummaryStat label="Niet afgehaald" value={notPickedUp} />
        <SummaryStat label="Actieve producten" value={activeProducts} />
      </div>
      <div className="dashboard-actions">
        <button type="button" className="primary-button" onClick={() => setActiveTab('bestellingen')}>
          Bestellingen openen
        </button>
        <button type="button" className="secondary-button" onClick={() => setActiveTab('producten')}>
          Producten beheren
        </button>
        <button type="button" className="secondary-button" onClick={() => setActiveTab('overzicht')}>
          Overzicht bekijken
        </button>
      </div>
    </section>
  )
}

function OrdersAdmin({ orders, searchTerm, setSearchTerm, statusFilter, setStatusFilter, setActiveTab }) {
  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return orders.filter((order) => {
      if (term && !order.name.toLowerCase().includes(term)) return false
      if (statusFilter === 'openstaand') return !order.pickedUp
      if (statusFilter === 'afgehaald') return order.pickedUp
      return true
    })
  }, [orders, searchTerm, statusFilter])

  const allTotal = orders.reduce((total, order) => total + getOrderTotal(order), 0)
  const paidTotal = orders.reduce((total, order) => total + getPaidAmount(order), 0)
  const outstandingTotal = orders.reduce((total, order) => total + getOutstandingAmount(order), 0)

  return (
    <>
      <div className="summary-card">
        <SummaryStat label="Totaal" value={formatCurrency(allTotal)} />
        <SummaryStat label="Betaald" value={formatCurrency(paidTotal)} />
        <SummaryStat label="Openstaand" value={formatCurrency(outstandingTotal)} />
      </div>

      <div className="status-filter-row">
        {['openstaand', 'afgehaald', 'alles'].map((filter) => (
          <button
            key={filter}
            type="button"
            className={`tab-button ${statusFilter === filter ? 'tab-button-active' : ''}`}
            onClick={() => setStatusFilter(filter)}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      <div className="search-row">
        <label className="field search-field">
          <span>Zoeken</span>
          <input
            type="text"
            placeholder="Zoek naam..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <button type="button" className="secondary-button summary-toggle-button" onClick={() => setActiveTab('overzicht')}>
          Overzicht maken
        </button>
      </div>

      <div className="people-list">
        {filteredOrders.length === 0 ? (
          <div className="empty-state">Geen bestellingen gevonden.</div>
        ) : (
          filteredOrders.map((order, orderIndex) => <OrderCard key={order.id} order={order} orderIndex={orderIndex} />)
        )}
      </div>
    </>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="summary-stat">
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function OrderCard({ order, orderIndex }) {
  const updateOrder = async (patch) => {
    await updateDoc(doc(db, 'orders', order.id), {
      ...patch,
      updatedAt: serverTimestamp(),
    })
  }

  const updateItem = (itemId, field, value) => {
    const nextItems = order.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    return updateOrder({ items: serializeOrder({ ...order, items: nextItems }).items })
  }

  const addItem = () => updateOrder({ items: serializeOrder({ ...order, items: [...order.items, createItem()] }).items })
  const removeItem = (itemId) => {
    if (order.items.length <= 1) return
    const nextItems = order.items.filter((item) => item.id !== itemId)
    return updateOrder({ items: serializeOrder({ ...order, items: nextItems }).items })
  }

  const removeOrder = () => deleteDoc(doc(db, 'orders', order.id))

  return (
    <article className={`person-card ${order.pickedUp ? 'is-picked-up' : ''}`}>
      <div className="person-header">
        <div className="person-index">
          <strong>Bestelling {orderIndex + 1}</strong>
          <span>{formatDate(order.createdAt ?? order.datum)}</span>
        </div>
        <label className="field top-field person-name-field">
          <span>Naam</span>
          <input value={order.name} onChange={(event) => updateOrder({ name: event.target.value })} placeholder="Naam" />
        </label>
        <label className="field top-field">
          <span>Betaalmethode</span>
          <select value={order.paymentMethod} onChange={(event) => updateOrder({ paymentMethod: event.target.value })}>
            {PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}
          </select>
        </label>
        <label className="field top-field">
          <span>Betaald</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={order.paidAmount}
            onChange={(event) => updateOrder({ paidAmount: event.target.value })}
          />
        </label>
        <button
          type="button"
          className={`toggle-button ${order.paymentStatus !== 'Niet betaald' ? 'toggle-active' : ''}`}
          onClick={() =>
            updateOrder({
              paymentStatus: order.paymentStatus === 'Niet betaald' ? order.paymentMethod : 'Niet betaald',
              paidAmount: order.paymentStatus === 'Niet betaald' ? String(getOrderTotal(order)) : '',
            })
          }
        >
          {order.paymentStatus === 'Niet betaald' ? 'Niet betaald' : 'Betaald'}
        </button>
        <button
          type="button"
          className={`toggle-button ${order.pickedUp ? 'toggle-active' : ''}`}
          onClick={() => updateOrder({ pickedUp: !order.pickedUp })}
        >
          {order.pickedUp ? 'Afgehaald: ja' : 'Afgehaald: nee'}
        </button>
        <button type="button" className="ghost-button remove-person-button" onClick={removeOrder}>
          Verwijderen
        </button>
      </div>

      <div className="table-wrap">
        <table className="items-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Kleur</th>
              <th>Maat</th>
              <th>Aantal</th>
              <th>Prijs</th>
              <th>Totaal</th>
              <th>Actie</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td><input value={item.name} onChange={(event) => updateItem(item.id, 'name', event.target.value)} /></td>
                <td><input value={item.color} onChange={(event) => updateItem(item.id, 'color', event.target.value)} /></td>
                <td><input value={item.size} onChange={(event) => updateItem(item.id, 'size', event.target.value)} /></td>
                <td><input type="number" min="0" step="1" value={item.quantity} onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} /></td>
                <td><input type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateItem(item.id, 'price', event.target.value)} /></td>
                <td className="line-total-cell">{formatCurrency(getItemTotal(item))}</td>
                <td className="action-cell">
                  <button type="button" className="ghost-button line-remove-button" onClick={() => removeItem(item.id)} disabled={order.items.length === 1}>
                    Verwijderen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="person-footer">
        <button type="button" className="secondary-button" onClick={addItem}>Lijn toevoegen</button>
        <div className="totals-row">
          <PersonTotal label="Totaal" value={formatCurrency(getOrderTotal(order))} />
          <PersonTotal label="Betaald" value={formatCurrency(getPaidAmount(order))} />
          <PersonTotal label="Openstaand" value={formatCurrency(getOutstandingAmount(order))} />
        </div>
      </div>
    </article>
  )
}

function PersonTotal({ label, value }) {
  return (
    <div className="person-total">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ProductsAdmin({ products }) {
  const [draft, setDraft] = useState(createProduct())
  const [editingProducts, setEditingProducts] = useState({})

  const saveProduct = async (product) => {
    const payload = {
      ...serializeProduct(product),
      updatedAt: serverTimestamp(),
    }

    if (product.id && products.some((existing) => existing.id === product.id)) {
      await updateDoc(doc(db, 'products', product.id), payload)
      setEditingProducts((currentProducts) => {
        const nextProducts = { ...currentProducts }
        delete nextProducts[product.id]
        return nextProducts
      })
      return
    }

    await addDoc(collection(db, 'products'), {
      ...payload,
      createdAt: serverTimestamp(),
    })
    setDraft(createProduct())
  }

  const updateEditingProduct = (product) => {
    setEditingProducts((currentProducts) => ({
      ...currentProducts,
      [product.id]: product,
    }))
  }

  return (
    <section className="products-section">
      <ProductEditor product={draft} onChange={setDraft} onSave={() => saveProduct(draft)} saveLabel="Product toevoegen" />
      <div className="products-grid">
        {products.length === 0 ? <div className="empty-state">Nog geen producten.</div> : null}
        {products.map((product) => (
          <ProductEditor
            key={product.id}
            product={editingProducts[product.id] ?? product}
            onChange={updateEditingProduct}
            onSave={() => saveProduct(editingProducts[product.id] ?? product)}
            onDelete={() => deleteDoc(doc(db, 'products', product.id))}
            compact
            saveLabel="Opslaan"
          />
        ))}
      </div>
    </section>
  )
}

function ProductEditor({ product, onChange, onSave, onDelete, compact = false, saveLabel }) {
  const updateProduct = (field, value) => onChange({ ...product, [field]: value })
  const colorText = product.colors.join(', ')
  const sizeText = product.sizes.join(', ')

  return (
    <article className={`product-card ${compact ? 'product-card-compact' : ''}`}>
      <div className="product-card-header">
        <h2>{compact ? product.name || 'Product' : 'Nieuw product'}</h2>
        {onDelete ? <button type="button" className="ghost-button" onClick={onDelete}>Verwijderen</button> : null}
      </div>
      <div className="product-form-grid">
        <label className="field">
          <span>Naam</span>
          <input value={product.name} onChange={(event) => updateProduct('name', event.target.value)} placeholder="Trui" />
        </label>
        <label className="field">
          <span>Prijs</span>
          <input type="number" min="0" step="0.01" value={product.price} onChange={(event) => updateProduct('price', event.target.value)} placeholder="45" />
        </label>
        <label className="field">
          <span>Categorie</span>
          <input value={product.category} onChange={(event) => updateProduct('category', event.target.value)} placeholder="Kleding" />
        </label>
        <label className="field">
          <span>Afbeelding</span>
          <input value={product.imageUrl} onChange={(event) => updateProduct('imageUrl', event.target.value)} placeholder="https://..." />
        </label>
        <label className="field">
          <span>Kleuren</span>
          <input value={colorText} onChange={(event) => updateProduct('colors', event.target.value.split(','))} placeholder="blauw, zwart" />
        </label>
        <label className="field">
          <span>Maten</span>
          <input value={sizeText} onChange={(event) => updateProduct('sizes', event.target.value.split(','))} placeholder="XS, S, M, L, XL, XXL, 3XL" />
        </label>
        <label className="field product-description-field">
          <span>Beschrijving</span>
          <textarea value={product.description} onChange={(event) => updateProduct('description', event.target.value)} placeholder="Korte productomschrijving" />
        </label>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={product.active} onChange={(event) => updateProduct('active', event.target.checked)} />
        <span>Actief</span>
      </label>
      <button type="button" className="primary-button" onClick={onSave} disabled={!product.name.trim()}>
        {saveLabel}
      </button>
    </article>
  )
}

function PublicOrderPage() {
  const { products, status: productStatus, error: productError } = useProducts(false)
  const [name, setName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Payconiq')
  const [cartItems, setCartItems] = useState([createCartLine()])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const getCartProduct = (item) =>
    products.find((product) => product.id === item.productId) ?? null

  const updateCartItem = (itemId, field, value) => {
    setCartItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item
        }

        if (field === 'productId') {
          const product = products.find((currentProduct) => currentProduct.id === value)
          return createCartLine(product)
        }

        return { ...item, [field]: value }
      }),
    )
  }

  const addCartItem = () => {
    setCartItems((currentItems) => [...currentItems, createCartLine()])
  }

  const removeCartItem = (itemId) => {
    setCartItems((currentItems) =>
      currentItems.length === 1 ? currentItems : currentItems.filter((item) => item.id !== itemId),
    )
  }

  const submitOrder = async (event) => {
    event.preventDefault()
    setMessage('')

    if (products.length === 0 || cartItems.some((item) => !getCartProduct(item))) {
      setMessage('Er zijn momenteel geen actieve producten beschikbaar.')
      return
    }

    if (!name.trim() || cartItems.some((item) => parseNumber(item.quantity) <= 0)) {
      setMessage('Vul je naam in en kies minstens een product.')
      return
    }

    setSubmitting(true)
    try {
      const orderItems = cartItems.map((item) => {
        const product = getCartProduct(item)
        const quantity = String(item.quantity ?? '1')
        const price = String(product.price ?? '')
        const lineItem = createItem({
          productId: product.id,
          name: product.name,
          product: product.name,
          color: item.color,
          size: item.size,
          quantity,
          price,
        })

        return {
          ...lineItem,
          lijnTotaal: String(getItemTotal(lineItem)),
        }
      })
      const order = createOrder({
        name,
        paymentMethod,
        paymentStatus: 'Niet betaald',
        paidAmount: '',
        pickedUp: false,
        items: orderItems,
        source: 'public',
      })
      await addDoc(collection(db, 'orders'), {
        ...serializeOrder(order),
        datum: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setName('')
      setCartItems([createCartLine()])
      setPaymentMethod('Payconiq')
      setMessage('Bestelling verzonden')
    } catch {
      setMessage('Bestelling opslaan mislukt. Probeer opnieuw.')
    } finally {
      setSubmitting(false)
    }
  }

  const total = cartItems.reduce((sum, item) => {
    const product = getCartProduct(item)
    return sum + parseNumber(item.quantity) * parseNumber(product?.price ?? item.price)
  }, 0)

  return (
    <Shell title="Bestellen" intro="Kies je producten en verstuur je bestelling." syncStatus={productStatus} error={productError}>
      <form className="public-order-form" onSubmit={submitOrder}>
        <section className="customer-card">
          <label className="field">
            <span>Naam</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Je naam" />
          </label>
          <label className="field">
            <span>Betaalmethode</span>
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              {PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
          </label>
        </section>

        <section className="cart-card">
          <h2>Je bestelling</h2>
          {products.length === 0 ? (
            <div className="empty-state">Er zijn momenteel geen actieve producten beschikbaar.</div>
          ) : (
            cartItems.map((item) => {
              const selectedProduct = getCartProduct(item)
              const lineTotal = parseNumber(item.quantity) * parseNumber(selectedProduct?.price ?? item.price)

              return (
                <div className="cart-line" key={item.id}>
                  <div className="cart-product-preview">
                    {selectedProduct?.imageUrl ? (
                      <img className="product-image" src={selectedProduct.imageUrl} alt={selectedProduct.name} />
                    ) : (
                      <div className="product-image product-image-placeholder">{selectedProduct?.name?.charAt(0) || 'K'}</div>
                    )}
                    <div>
                      <strong>{selectedProduct?.name || 'Kies een product'}</strong>
                      {selectedProduct?.category ? <p className="product-category">{selectedProduct.category}</p> : null}
                      {selectedProduct?.description ? <p className="product-description">{selectedProduct.description}</p> : null}
                    </div>
                  </div>
                  <div className="cart-line-grid">
                    <label className="field">
                      <span>Product</span>
                      <select value={item.productId} onChange={(event) => updateCartItem(item.id, 'productId', event.target.value)}>
                        <option value="">Kies product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} - {formatCurrency(parseNumber(product.price))}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedProduct?.colors.length > 0 ? (
                      <label className="field">
                        <span>Kleur</span>
                        <select value={item.color} onChange={(event) => updateCartItem(item.id, 'color', event.target.value)}>
                          {selectedProduct.colors.map((productColor) => (
                            <option key={productColor}>{productColor}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {selectedProduct?.sizes.length > 0 ? (
                      <label className="field">
                        <span>Maat</span>
                        <select value={item.size} onChange={(event) => updateCartItem(item.id, 'size', event.target.value)}>
                          {selectedProduct.sizes.map((productSize) => (
                            <option key={productSize}>{productSize}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="field">
                      <span>Aantal</span>
                      <input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateCartItem(item.id, 'quantity', event.target.value)} />
                    </label>
                  </div>
                  <div className="cart-line-footer">
                    <span>{formatCurrency(lineTotal)}</span>
                    <button type="button" className="ghost-button" onClick={() => removeCartItem(item.id)} disabled={cartItems.length === 1}>
                      Lijn verwijderen
                    </button>
                  </div>
                </div>
              )
            })
          )}
          <button type="button" className="secondary-button" onClick={addCartItem} disabled={products.length === 0}>
            Product toevoegen
          </button>
          <div className="public-total">
            <span>Totaal</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
          {message ? <p className="sync-status">{message}</p> : null}
          <button type="submit" className="primary-button submit-order-button" disabled={submitting || !isFirebaseConfigured || products.length === 0}>
            {submitting ? 'Versturen...' : 'Bestelling versturen'}
          </button>
        </section>
      </form>
    </Shell>
  )
}

function Overview({ orders, onPrint }) {
  const { summaryProducts, summarySizes } = useOrderSummary(orders)
  const groupedProducts = useMemo(() => {
    const productMap = new Map()

    summaryProducts.forEach((product) => {
      const currentProduct = productMap.get(product.name) ?? {
        name: product.name,
        totalQuantity: 0,
        colors: [],
      }
      currentProduct.totalQuantity += product.totalQuantity
      currentProduct.colors.push(product)
      productMap.set(product.name, currentProduct)
    })

    return Array.from(productMap.values())
  }, [summaryProducts])

  return (
    <section className="order-summary-section">
      <div className="order-summary-header">
        <div>
          <h2>Overzicht per product, kleur en maat</h2>
          <p className="intro">Enkel aantallen, zonder namen of betaalstatus.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onPrint}>Overzicht afdrukken</button>
      </div>
      {groupedProducts.length === 0 ? (
        <div className="empty-state">Nog geen producten in de bestellijst.</div>
      ) : (
        <div className="order-summary-list">
          {groupedProducts.map((product) => (
            <article className="summary-product-card" key={product.name}>
              <div className="summary-product-header">
                <h3>{product.name}</h3>
                <span className="summary-product-total">Totaal: {product.totalQuantity}</span>
              </div>
              <div className="summary-color-list">
                {product.colors.map((colorGroup) => (
                  <div className="summary-color-card" key={`${product.name}-${colorGroup.color}`}>
                    <strong>{colorGroup.color}</strong>
                    <div className="summary-size-list">
                      {summarySizes
                        .filter((size) => colorGroup.sizes[size])
                        .map((size) => (
                          <div className="summary-size-row" key={`${product.name}-${colorGroup.color}-${size}`}>
                            <span>{size}</span>
                            <strong>{colorGroup.sizes[size]}</strong>
                          </div>
                        ))}
                      <div className="summary-size-row summary-size-row-total">
                        <span>Totaal</span>
                        <strong>{colorGroup.totalQuantity}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function useOrderSummary(orders) {
  return useMemo(() => {
    const summary = new Map()

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const name = item.name.trim()
        const quantity = parseNumber(item.quantity)
        if (!name || quantity <= 0) return

        const color = item.color.trim() || 'Geen kleur'
        const size = item.size.trim() || 'Geen maat'
        const key = `${name}__${color}`
        const existing = summary.get(key) ?? { name, color, totalQuantity: 0, sizes: {} }
        existing.totalQuantity += quantity
        existing.sizes[size] = (existing.sizes[size] ?? 0) + quantity
        summary.set(key, existing)
      })
    })

    const summaryProducts = Array.from(summary.values()).sort((a, b) =>
      `${a.name} ${a.color}`.localeCompare(`${b.name} ${b.color}`, 'nl-BE', { numeric: true }),
    )
    const summarySizes = Array.from(new Set(summaryProducts.flatMap((product) => Object.keys(product.sizes)))).sort((a, b) =>
      a.localeCompare(b, 'nl-BE', { numeric: true }),
    )

    return { summaryProducts, summarySizes }
  }, [orders])
}

function PrintSheets({ orders, statusFilter }) {
  const printableOrders = orders
    .filter((order) => {
      if (statusFilter === 'openstaand') return !order.pickedUp
      if (statusFilter === 'afgehaald') return order.pickedUp
      return true
    })
    .filter((order) => order.items.some((item) => item.name.trim()))
  const { summaryProducts, summarySizes } = useOrderSummary(orders)
  const statusFilterLabel = statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)

  return (
    <>
      <section className="print-sheet" aria-hidden="true">
        <div className="print-header">
          <h1>Bestellijst</h1>
          <p>Filter: {statusFilterLabel}</p>
        </div>
        {printableOrders.length === 0 ? <p className="print-empty">Geen personen om af te drukken.</p> : null}
        <div className="print-list">
          {printableOrders.map((order) => (
            <article key={`print-${order.id}`} className="print-person-card">
              <h2 className="print-person-name">{order.name.trim() || 'Onbekend'}</h2>
              <ul className="print-order-list">
                {order.items.filter((item) => item.name.trim()).map((item) => (
                  <li key={`${order.id}-${item.id}`}>
                    {parseNumber(item.quantity)}x {item.name}
                    {item.color ? ` ${item.color}` : ''}
                    {item.size ? ` maat ${item.size}` : ''}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="print-summary-sheet" aria-hidden="true">
        <div className="print-header">
          <h1>Productoverzicht</h1>
          <p>Samenvatting van alle producten per kleur en maat</p>
        </div>
        <table className="print-summary-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Kleur</th>
              {summarySizes.map((size) => <th key={`print-header-${size}`}>{size}</th>)}
              <th>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {summaryProducts.map((product) => (
              <tr key={`summary-print-${product.name}-${product.color}`}>
                <td>{product.name}</td>
                <td>{product.color}</td>
                {summarySizes.map((size) => <td key={`print-${product.name}-${product.color}-${size}`}>{product.sizes[size] ?? 0}</td>)}
                <td>{product.totalQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/bestellen" replace />} />
        <Route path="/bestellen" element={<PublicOrderPage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/bestellen" replace />} />
      </Routes>
    </Router>
  )
}

export default App
