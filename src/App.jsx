import { useEffect, useRef, useState } from 'react'
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import './App.css'
import { db, isFirebaseConfigured } from './firebase.js'

const COLLECTION_NAME = 'krcg'
const DOCUMENT_NAME = 'bestellijst'

const createItem = (overrides = {}) => ({
  id: crypto.randomUUID(),
  name: '',
  size: '',
  quantity: '1',
  price: '',
  ...overrides,
})

const createPerson = (overrides = {}) => ({
  id: crypto.randomUUID(),
  name: '',
  paymentStatus: 'Niet betaald',
  paidAmount: '',
  pickedUp: false,
  items: [createItem()],
  ...overrides,
})

const formatCurrency = (value) =>
  new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)

const parseNumber = (value) => {
  const normalized = String(value).replace(',', '.')
  const number = Number(normalized)

  return Number.isFinite(number) ? number : 0
}

const normalizeItem = (item = {}) =>
  createItem({
    id: item.id || crypto.randomUUID(),
    name: item.name ?? '',
    size: item.size ?? '',
    quantity: item.quantity ?? '1',
    price: item.price ?? '',
  })

const normalizePerson = (person = {}) =>
  createPerson({
    id: person.id || crypto.randomUUID(),
    name: person.name ?? '',
    paymentStatus: person.paymentStatus ?? 'Niet betaald',
    paidAmount: person.paidAmount ?? '',
    pickedUp: Boolean(person.pickedUp),
    items:
      Array.isArray(person.items) && person.items.length > 0
        ? person.items.map(normalizeItem)
        : [createItem()],
  })

const normalizePeople = (people) =>
  Array.isArray(people) && people.length > 0
    ? people.map(normalizePerson)
    : [createPerson()]

function App() {
  const [people, setPeople] = useState(() => normalizePeople([]))
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('openstaand')
  const [activeTab, setActiveTab] = useState('bestellingen')
  const [printMode, setPrintMode] = useState('list')
  const [syncStatus, setSyncStatus] = useState(
    isFirebaseConfigured ? 'Laden...' : 'Firebase instellen',
  )
  const [firestoreError, setFirestoreError] = useState(
    isFirebaseConfigured
      ? ''
      : 'Firebase is niet volledig ingesteld. Controleer je .env-bestand.',
  )
  const listDocRef = useRef(
    isFirebaseConfigured ? doc(db, COLLECTION_NAME, DOCUMENT_NAME) : null,
  )
  const hasLoadedRemoteRef = useRef(false)
  const lastSyncedPeopleJsonRef = useRef('')

  const applyPeopleUpdate = (updater) => {
    setPeople((currentPeople) => {
      const nextPeople =
        typeof updater === 'function' ? updater(currentPeople) : updater

      return normalizePeople(nextPeople)
    })
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !listDocRef.current) {
      setSyncStatus('Firebase instellen')
      return undefined
    }

    const unsubscribe = onSnapshot(
      listDocRef.current,
      { includeMetadataChanges: true },
      async (snapshot) => {
        try {
          const remotePeople = snapshot.data()?.people

          if (!snapshot.exists() || !Array.isArray(remotePeople) || remotePeople.length === 0) {
            const initialPeople = normalizePeople([])

            await setDoc(
              listDocRef.current,
              {
                people: initialPeople,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            )
            return
          }

          const nextPeople = normalizePeople(remotePeople)

          hasLoadedRemoteRef.current = true
          lastSyncedPeopleJsonRef.current = JSON.stringify(nextPeople)
          setPeople(nextPeople)
          setFirestoreError('')
          setSyncStatus(
            snapshot.metadata.hasPendingWrites ? 'Opslaan...' : 'Online gedeeld',
          )
        } catch (error) {
          hasLoadedRemoteRef.current = true
          setSyncStatus('Lezen mislukt')
          setFirestoreError(
            error instanceof Error
              ? `Firestore lezen mislukt: ${error.message}`
              : 'Firestore lezen mislukt.',
          )
        }
      },
      (error) => {
        hasLoadedRemoteRef.current = true
        setSyncStatus('Lezen mislukt')
        setFirestoreError(
          error instanceof Error
            ? `Firestore lezen mislukt: ${error.message}`
            : 'Firestore lezen mislukt.',
        )
      },
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    if (
      !isFirebaseConfigured ||
      !listDocRef.current ||
      !hasLoadedRemoteRef.current
    ) {
      return
    }

    const serializedPeople = JSON.stringify(people)

    if (serializedPeople === lastSyncedPeopleJsonRef.current) {
      return
    }

    const savePeople = async () => {
      try {
        setSyncStatus('Opslaan...')

        await setDoc(
          listDocRef.current,
          {
            people,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        setFirestoreError('')
      } catch {
        setSyncStatus('Opslaan mislukt')
        setFirestoreError('Firestore schrijven mislukt. Controleer je rechten en verbinding.')
      }
    }

    void savePeople()
  }, [people])

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintMode('list')
    }

    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  const updatePersonName = (personId, name) => {
    applyPeopleUpdate((currentPeople) =>
      currentPeople.map((person) =>
        person.id === personId ? { ...person, name } : person,
      ),
    )
  }

  const updatePersonField = (personId, field, value) => {
    applyPeopleUpdate((currentPeople) =>
      currentPeople.map((person) =>
        person.id === personId ? { ...person, [field]: value } : person,
      ),
    )
  }

  const updateItem = (personId, itemId, field, value) => {
    applyPeopleUpdate((currentPeople) =>
      currentPeople.map((person) =>
        person.id === personId
          ? {
              ...person,
              items: person.items.map((item) =>
                item.id === itemId ? { ...item, [field]: value } : item,
              ),
            }
          : person,
      ),
    )
  }

  const addPerson = () => {
    applyPeopleUpdate((currentPeople) => [...currentPeople, createPerson()])
  }

  const removePerson = (personId) => {
    applyPeopleUpdate((currentPeople) =>
      currentPeople.length === 1
        ? currentPeople
        : currentPeople.filter((person) => person.id !== personId),
    )
  }

  const addItem = (personId) => {
    applyPeopleUpdate((currentPeople) =>
      currentPeople.map((person) =>
        person.id === personId
          ? { ...person, items: [...person.items, createItem()] }
          : person,
      ),
    )
  }

  const removeItem = (personId, itemId) => {
    applyPeopleUpdate((currentPeople) =>
      currentPeople.map((person) => {
        if (person.id !== personId) {
          return person
        }

        if (person.items.length === 1) {
          return person
        }

        return {
          ...person,
          items: person.items.filter((item) => item.id !== itemId),
        }
      }),
    )
  }

  const getItemTotal = (item) => parseNumber(item.quantity) * parseNumber(item.price)

  const getPersonTotal = (person) =>
    person.items.reduce((total, item) => total + getItemTotal(item), 0)

  const getPaidAmount = (person) => parseNumber(person.paidAmount)

  const getOutstandingAmount = (person) =>
    Math.max(getPersonTotal(person) - getPaidAmount(person), 0)

  const summarizeItems = (items) =>
    items
      .filter((item) => item.name.trim() && parseNumber(item.quantity) > 0)
      .map((item) => {
        const quantity = parseNumber(item.quantity)
        const size = item.size.trim()

        return `${quantity}x ${item.name.trim()}${size ? ` (${size})` : ''} - ${formatCurrency(getItemTotal(item))}`
      })

  const allPeopleTotal = people.reduce(
    (total, person) => total + getPersonTotal(person),
    0,
  )

  const allPaidTotal = people.reduce(
    (total, person) => total + getPaidAmount(person),
    0,
  )

  const allOutstandingTotal = people.reduce(
    (total, person) => total + getOutstandingAmount(person),
    0,
  )

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  const orderSummary = people.reduce((summary, person) => {
    person.items.forEach((item) => {
      const productName = item.name.trim()
      const quantity = parseNumber(item.quantity)

      if (!productName || quantity <= 0) {
        return
      }

      const size = item.size.trim() || 'Geen maat'
      const existingProduct = summary[productName] ?? {
        name: productName,
        totalQuantity: 0,
        sizes: {},
      }
      const currentSizeTotal = existingProduct.sizes[size] ?? 0

      existingProduct.totalQuantity += quantity
      existingProduct.sizes[size] = currentSizeTotal + quantity
      summary[productName] = existingProduct
    })

    return summary
  }, {})

  const summaryProducts = Object.values(orderSummary)
    .map((product) => ({
      ...product,
      sizeEntries: Object.entries(product.sizes).sort(([sizeA], [sizeB]) =>
        sizeA.localeCompare(sizeB, 'nl-BE', { numeric: true }),
      ),
    }))
    .sort((productA, productB) =>
      productA.name.localeCompare(productB.name, 'nl-BE', { numeric: true }),
    )

  const summarySizes = Array.from(
    new Set(
      summaryProducts.flatMap((product) =>
        product.sizeEntries.map(([size]) => size),
      ),
    ),
  ).sort((sizeA, sizeB) =>
    sizeA.localeCompare(sizeB, 'nl-BE', { numeric: true }),
  )

  const filteredPeople = people.filter((person) => {
    const matchesSearch = person.name.toLowerCase().includes(normalizedSearchTerm)

    if (!matchesSearch) {
      return false
    }

    if (statusFilter === 'openstaand') {
      return !person.pickedUp
    }

    if (statusFilter === 'afgehaald') {
      return person.pickedUp
    }

    return true
  })

  const handlePrint = (nextPrintMode) => {
    setPrintMode(nextPrintMode)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print()
      })
    })
  }

  const statusFilterLabel =
    statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)

  return (
    <main className={`app-shell print-mode-${printMode}`}>
      <section className="page-card">
        <div className="page-header">
          <div>
            <p className="eyebrow">Gedeelde bestellijst</p>
            <h1>Overzicht van alle personen en items</h1>
            <p className="intro">
              Voeg personen toe, beheer hun items en bekijk automatisch alle
              totalen.
            </p>
            <p
              className={`sync-status ${
                syncStatus === 'Opslaan...' ? 'sync-status-saving' : ''
              }`}
            >
              {syncStatus}
            </p>
            {firestoreError ? (
              <p className="sync-status sync-status-error">{firestoreError}</p>
            ) : null}
          </div>

          <div className="header-actions">
            {activeTab === 'bestellingen' ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handlePrint('list')}
                >
                  Bestellijst afdrukken
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={addPerson}
                >
                  Persoon toevoegen
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => handlePrint('summary')}
              >
                Overzicht afdrukken
              </button>
            )}
          </div>
        </div>

        <div className="tabs-row">
          <button
            type="button"
            className={`tab-button ${
              activeTab === 'bestellingen' ? 'tab-button-active' : ''
            }`}
            onClick={() => setActiveTab('bestellingen')}
          >
            Bestellingen
          </button>
          <button
            type="button"
            className={`tab-button ${
              activeTab === 'overzicht' ? 'tab-button-active' : ''
            }`}
            onClick={() => setActiveTab('overzicht')}
          >
            Overzicht
          </button>
        </div>

        {activeTab === 'bestellingen' ? (
          <>
            <div className="summary-card">
              <div className="summary-stat">
                <span className="summary-label">Totaal</span>
                <strong>{formatCurrency(allPeopleTotal)}</strong>
              </div>
              <div className="summary-stat">
                <span className="summary-label">Betaald</span>
                <strong>{formatCurrency(allPaidTotal)}</strong>
              </div>
              <div className="summary-stat">
                <span className="summary-label">Openstaand</span>
                <strong>{formatCurrency(allOutstandingTotal)}</strong>
              </div>
            </div>

            <div className="status-filter-row">
              <button
                type="button"
                className={`tab-button ${
                  statusFilter === 'openstaand' ? 'tab-button-active' : ''
                }`}
                onClick={() => setStatusFilter('openstaand')}
              >
                Openstaand
              </button>
              <button
                type="button"
                className={`tab-button ${
                  statusFilter === 'afgehaald' ? 'tab-button-active' : ''
                }`}
                onClick={() => setStatusFilter('afgehaald')}
              >
                Afgehaald
              </button>
              <button
                type="button"
                className={`tab-button ${
                  statusFilter === 'alles' ? 'tab-button-active' : ''
                }`}
                onClick={() => setStatusFilter('alles')}
              >
                Alles
              </button>
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
              <button
                type="button"
                className="secondary-button summary-toggle-button"
                onClick={() => setActiveTab('overzicht')}
              >
                Overzicht maken
              </button>
            </div>

            <div className="people-list">
              {filteredPeople.length === 0 ? (
                <div className="empty-state">Geen resultaten</div>
              ) : (
                filteredPeople.map((person, personIndex) => {
                  const personTotal = getPersonTotal(person)
                  const paidAmount = getPaidAmount(person)
                  const outstandingAmount = getOutstandingAmount(person)

                  return (
                    <article
                      key={person.id}
                      className={`person-card ${person.pickedUp ? 'is-picked-up' : ''}`}
                    >
                      <div className="person-header">
                        <div className="person-index">Persoon {personIndex + 1}</div>

                    <label className="field top-field person-name-field">
                      <span>Naam</span>
                      <input
                        type="text"
                        placeholder="Naam van persoon"
                        value={person.name}
                        onChange={(event) =>
                          updatePersonName(person.id, event.target.value)
                        }
                      />
                    </label>

                    <label className="field top-field">
                      <span>Betaalstatus</span>
                      <select
                        value={person.paymentStatus}
                        onChange={(event) =>
                          updatePersonField(
                            person.id,
                            'paymentStatus',
                            event.target.value,
                          )
                        }
                      >
                        <option>Niet betaald</option>
                        <option>Cash</option>
                        <option>Payconiq</option>
                      </select>
                    </label>

                    <label className="field top-field">
                      <span>Betaald</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={person.paidAmount}
                        onChange={(event) =>
                          updatePersonField(
                            person.id,
                            'paidAmount',
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <button
                      type="button"
                      className={`toggle-button ${
                        person.pickedUp ? 'toggle-active' : ''
                      }`}
                      onClick={() =>
                        updatePersonField(person.id, 'pickedUp', !person.pickedUp)
                      }
                    >
                      {person.pickedUp ? 'Afgehaald: ja' : 'Afgehaald: nee'}
                    </button>

                    <button
                      type="button"
                      className="ghost-button remove-person-button"
                      onClick={() => removePerson(person.id)}
                      disabled={people.length === 1}
                    >
                      Persoon verwijderen
                    </button>
                  </div>

                  <div className="table-wrap">
                    <table className="items-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Maat</th>
                          <th>Aantal</th>
                          <th>Prijs</th>
                          <th>Totaal</th>
                          <th>Actie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {person.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <input
                                type="text"
                                placeholder="Product"
                                value={item.name}
                                onChange={(event) =>
                                  updateItem(
                                    person.id,
                                    item.id,
                                    'name',
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                placeholder="Maat"
                                value={item.size}
                                onChange={(event) =>
                                  updateItem(
                                    person.id,
                                    item.id,
                                    'size',
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={item.quantity}
                                onChange={(event) =>
                                  updateItem(
                                    person.id,
                                    item.id,
                                    'quantity',
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0,00"
                                value={item.price}
                                onChange={(event) =>
                                  updateItem(
                                    person.id,
                                    item.id,
                                    'price',
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="line-total-cell">
                              {formatCurrency(getItemTotal(item))}
                            </td>
                            <td className="action-cell">
                              <button
                                type="button"
                                className="ghost-button line-remove-button"
                                onClick={() => removeItem(person.id, item.id)}
                                disabled={person.items.length === 1}
                              >
                                Verwijderen
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="person-footer">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => addItem(person.id)}
                    >
                      Lijn toevoegen
                    </button>

                    <div className="totals-row">
                      <div className="person-total">
                        <span>Totaal</span>
                        <strong>{formatCurrency(personTotal)}</strong>
                      </div>
                      <div className="person-total">
                        <span>Betaald</span>
                        <strong>{formatCurrency(paidAmount)}</strong>
                      </div>
                      <div className="person-total">
                        <span>Openstaand</span>
                        <strong>{formatCurrency(outstandingAmount)}</strong>
                      </div>
                    </div>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </>
        ) : (
          <section className="order-summary-section">
            <div className="order-summary-header">
              <div>
                <h2>Overzicht per product en maat</h2>
                <p className="intro">
                  Enkel aantallen per product en maat, zonder namen, prijzen of betaalstatus.
                </p>
              </div>
              <div className="order-summary-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handlePrint('summary')}
                >
                  Overzicht afdrukken
                </button>
              </div>
            </div>

            {summaryProducts.length === 0 ? (
              <div className="empty-state">Nog geen producten in de bestellijst.</div>
            ) : (
              <div className="table-wrap order-summary-table-wrap">
                <table className="items-table order-summary-table">
                  <thead>
                    <tr>
                      <th>Productnaam</th>
                      {summarySizes.map((size) => (
                        <th key={`header-${size}`}>{size}</th>
                      ))}
                      <th>Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryProducts.map((product) => {
                      const sizeMap = Object.fromEntries(product.sizeEntries)

                      return (
                        <tr key={product.name}>
                          <td className="summary-product-name-cell">{product.name}</td>
                          {summarySizes.map((size) => (
                            <td key={`${product.name}-${size}`}>
                              {sizeMap[size] ?? 0}
                            </td>
                          ))}
                          <td className="line-total-cell">{product.totalQuantity}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section className="print-sheet" aria-hidden="true">
          <div className="print-header">
            <h1>Bestellijst</h1>
            <p>Filter: {statusFilterLabel}</p>
          </div>

          {filteredPeople.length === 0 ? (
            <p className="print-empty">Geen personen om af te drukken.</p>
          ) : (
            <div className="print-list">
              {filteredPeople.map((person) => {
                const personTotal = getPersonTotal(person)
                const paidAmount = getPaidAmount(person)
                const outstandingAmount = getOutstandingAmount(person)
                const itemSummary = summarizeItems(person.items)

                return (
                  <article key={`print-${person.id}`} className="print-person-card">
                    <div className="print-person-row">
                      <span className="print-label">Naam</span>
                      <strong>{person.name.trim() || 'Onbekend'}</strong>
                    </div>

                    <div className="print-person-row">
                      <span className="print-label">Bestelling</span>
                      <div className="print-order-list">
                        {itemSummary.length === 0 ? (
                          <span>Geen bestelling</span>
                        ) : (
                          itemSummary.map((summaryLine, index) => (
                            <span key={`${person.id}-${index}`}>{summaryLine}</span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="print-totals-grid">
                      <div className="print-person-row">
                        <span className="print-label">Totaal te betalen</span>
                        <strong>{formatCurrency(personTotal)}</strong>
                      </div>
                      <div className="print-person-row">
                        <span className="print-label">Betaald bedrag</span>
                        <strong>{formatCurrency(paidAmount)}</strong>
                      </div>
                      <div className="print-person-row">
                        <span className="print-label">Openstaand bedrag</span>
                        <strong>{formatCurrency(outstandingAmount)}</strong>
                      </div>
                      <div className="print-person-row">
                        <span className="print-label">Status afgehaald</span>
                        <strong>{person.pickedUp ? 'Ja' : 'Nee'}</strong>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="print-summary-sheet" aria-hidden="true">
          <div className="print-header">
            <h1>Productoverzicht</h1>
            <p>Samenvatting van alle producten per maat</p>
          </div>

          {summaryProducts.length === 0 ? (
            <p className="print-empty">Geen producten om af te drukken.</p>
          ) : (
            <table className="print-summary-table">
              <thead>
                <tr>
                  <th>Productnaam</th>
                  {summarySizes.map((size) => (
                    <th key={`print-header-${size}`}>{size}</th>
                  ))}
                  <th>Totaal</th>
                </tr>
              </thead>
              <tbody>
                {summaryProducts.map((product) => {
                  const sizeMap = Object.fromEntries(product.sizeEntries)

                  return (
                    <tr key={`summary-print-${product.name}`}>
                      <td>{product.name}</td>
                      {summarySizes.map((size) => (
                        <td key={`print-${product.name}-${size}`}>
                          {sizeMap[size] ?? 0}
                        </td>
                      ))}
                      <td>{product.totalQuantity}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
