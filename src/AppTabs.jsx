import { useEffect, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'krcg-bestellijst'

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

const loadStoredPeople = () => {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY)

    if (!storedValue) {
      return normalizePeople([])
    }

    return normalizePeople(JSON.parse(storedValue))
  } catch {
    return normalizePeople([])
  }
}

function AppTabs() {
  const [people, setPeople] = useState(loadStoredPeople)
  const [searchTerm, setSearchTerm] = useState('')
  const [pickupMode, setPickupMode] = useState(false)
  const [activeTab, setActiveTab] = useState('bestellingen')

  const applyPeopleUpdate = (updater) => {
    setPeople((currentPeople) => {
      const nextPeople =
        typeof updater === 'function' ? updater(currentPeople) : updater

      return normalizePeople(nextPeople)
    })
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(people))
    } catch {
      // Als localStorage niet beschikbaar is, blijft de app werken in state.
    }
  }, [people])

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

  const filteredPeople = people.filter((person) => {
    const matchesSearch = person.name.toLowerCase().includes(normalizedSearchTerm)
    const matchesPickupMode = !pickupMode || !person.pickedUp

    return matchesSearch && matchesPickupMode
  })

  const orderSummaryMap = people.reduce((summary, person) => {
    person.items.forEach((item) => {
      const productName = item.name.trim()
      const sizeName = item.size.trim() || 'Geen maat'
      const quantity = parseNumber(item.quantity)

      if (!productName || quantity <= 0) {
        return
      }

      if (!summary.has(productName)) {
        summary.set(productName, {
          product: productName,
          total: 0,
          sizes: new Map(),
        })
      }

      const productEntry = summary.get(productName)
      productEntry.total += quantity
      productEntry.sizes.set(
        sizeName,
        (productEntry.sizes.get(sizeName) || 0) + quantity,
      )
    })

    return summary
  }, new Map())

  const orderSummary = Array.from(orderSummaryMap.values())
    .map((entry) => ({
      ...entry,
      sizes: Array.from(entry.sizes.entries())
        .map(([size, quantity]) => ({ size, quantity }))
        .sort((left, right) =>
          left.size.localeCompare(right.size, 'nl-BE', { numeric: true }),
        ),
    }))
    .sort((left, right) =>
      left.product.localeCompare(right.product, 'nl-BE', { numeric: true }),
    )

  return (
    <main className="app-shell">
      <section className="page-card">
        <div className="page-header">
          <div>
            <p className="eyebrow">Genkies Casuals Bestel App</p>
            <h1>Genkies Casuals Bestel App</h1>
            <p className="intro">
              Beheer bestellingen, personen en totalen op één plek
            </p>
          </div>
          {activeTab === 'bestellingen' ? (
            <button
              type="button"
              className="primary-button"
              onClick={addPerson}
            >
              Persoon toevoegen
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={() => window.print()}
            >
              Printen
            </button>
          )}
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
              activeTab === 'bestellen' ? 'tab-button-active' : ''
            }`}
            onClick={() => setActiveTab('bestellen')}
          >
            Bestellen
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

            <div className="controls-row">
              <div
                className={`pickup-status ${
                  pickupMode ? 'pickup-status-active' : ''
                }`}
              >
                Afhaalmodus {pickupMode ? 'AAN' : 'UIT'}
              </div>
              <button
                type="button"
                className={`mode-button ${
                  pickupMode ? 'mode-button-active' : ''
                }`}
                onClick={() => setPickupMode((currentValue) => !currentValue)}
              >
                Afhaalmodus
              </button>
            </div>

            <div className={`search-row ${pickupMode ? 'search-row-pickup' : ''}`}>
              <label className="field search-field">
                <span>Zoeken</span>
                <input
                  type="text"
                  placeholder="Zoek naam..."
                  value={searchTerm}
                  autoFocus={pickupMode}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
              {pickupMode ? (
                <p className="pickup-hint">
                  Alleen personen die nog niet afgehaald zijn worden getoond.
                </p>
              ) : null}
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
                      className={`person-card ${
                        person.pickedUp ? 'is-picked-up' : ''
                      } ${pickupMode ? 'person-card-pickup-mode' : ''}`}
                    >
                      <div className="person-header">
                        <div className="person-index">
                          Persoon {personIndex + 1}
                        </div>

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
                          } ${pickupMode ? 'toggle-button-pickup-mode' : ''}`}
                          onClick={() =>
                            updatePersonField(
                              person.id,
                              'pickedUp',
                              !person.pickedUp,
                            )
                          }
                        >
                          {person.pickedUp
                            ? 'Afgehaald ✅'
                            : 'Nog niet afgehaald ❌'}
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
                <h2>Bestellen</h2>
                <p className="intro">
                  Overzicht van alles wat in totaal besteld moet worden,
                  gegroepeerd per product en maat.
                </p>
              </div>
            </div>

            {orderSummary.length === 0 ? (
              <div className="empty-state">Geen resultaten</div>
            ) : (
              <div className="order-summary-list">
                {orderSummary.map((product) => (
                  <article key={product.product} className="summary-product-card">
                    <div className="summary-product-header">
                      <h3>{product.product}</h3>
                      <div className="summary-product-total">
                        Totaal: {product.total}
                      </div>
                    </div>

                    <div className="summary-size-list">
                      {product.sizes.map((size) => (
                        <div
                          key={`${product.product}-${size.size}`}
                          className="summary-size-row"
                        >
                          <span>{size.size}</span>
                          <strong>{size.quantity}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  )
}

export default AppTabs
