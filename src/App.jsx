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

function App() {
  const [people, setPeople] = useState(loadStoredPeople)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('openstaand')

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

  const handlePrint = () => {
    window.print()
  }

  const statusFilterLabel =
    statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)

  return (
    <main className="app-shell">
      <section className="page-card">
        <div className="page-header">
          <div>
            <p className="eyebrow">Gedeelde bestellijst</p>
            <h1>Overzicht van alle personen en items</h1>
            <p className="intro">
              Voeg personen toe, beheer hun items en bekijk automatisch alle
              totalen.
            </p>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handlePrint}
            >
              Bestellijst afdrukken
            </button>
            <button type="button" className="primary-button" onClick={addPerson}>
              Persoon toevoegen
            </button>
          </div>
        </div>

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
      </section>
    </main>
  )
}

export default App
