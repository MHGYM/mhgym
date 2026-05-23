import { useState, useEffect } from 'react'
import { ShoppingCart, X, Plus, Minus, Trash2, AlertCircle, Package } from 'lucide-react'
import api from '../api'

// Emoji per categorie
const CATEGORY_EMOJI = {
  handschoenen: '🥊',
  bescherming:  '🛡️',
  kleding:      '👕',
  accessoires:  '⚡',
}

const CATEGORIES = ['alle', 'handschoenen', 'bescherming', 'kleding', 'accessoires']

function CartSidebar({ cart, onClose, onCheckout, checkingOut }) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const count = cart.reduce((s, i) => s + i.qty, 0)

  return (
    <>
      <div className="cart-overlay" onClick={onClose} />
      <div className="cart-sidebar">
        <div className="cart-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShoppingCart size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontWeight: 700 }}>Winkelwagen</h3>
            <span className="cart-badge" style={{ position: 'static', marginLeft: 4 }}>{count}</span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="cart-items">
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🛒</div>
              <p>Je winkelwagen is leeg</p>
            </div>
          ) : (
            cart.map((item) => (
              <CartItemRow key={item.id} item={item} />
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Totaal</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent)' }}>
                €{total.toFixed(2).replace('.', ',')}
              </span>
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={onCheckout}
              disabled={checkingOut}
            >
              {checkingOut ? <span className="spinner spinner-sm" /> : <>Afrekenen <ShoppingCart size={16} /></>}
            </button>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              🔒 Veilig betalen via Mollie
            </p>
          </div>
        )}
      </div>
    </>
  )
}

// CartItemRow needs access to setCart — pass as context
let _setCart = null

function CartItemRow({ item }) {
  const updateQty = (delta) => {
    _setCart((prev) => {
      const updated = prev.map((i) => i.id === item.id ? { ...i, qty: i.qty + delta } : i)
      return updated.filter((i) => i.qty > 0)
    })
  }

  return (
    <div className="cart-item">
      <div className="cart-item-emoji">{CATEGORY_EMOJI[item.category] || '📦'}</div>
      <div className="cart-item-info">
        <div className="cart-item-name">{item.name}</div>
        <div className="cart-item-price">€{(item.price * item.qty).toFixed(2).replace('.', ',')}</div>
      </div>
      <div className="cart-qty-ctrl">
        <button className="cart-qty-btn" onClick={() => updateQty(-1)}><Minus size={12} /></button>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '1.5rem', textAlign: 'center' }}>{item.qty}</span>
        <button className="cart-qty-btn" onClick={() => updateQty(1)}><Plus size={12} /></button>
      </div>
    </div>
  )
}

export default function ShopPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [category, setCategory] = useState('alle')
  const [cart, setCart]         = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  _setCart = setCart // expose for CartItemRow

  useEffect(() => {
    ;(async () => {
      try {
        const res = await api.get('/shop/products')
        setProducts(res.data.products)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id)
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
    setCartOpen(true)
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return
    setCheckingOut(true); setError('')
    try {
      const items = cart.map((i) => ({ product_id: i.id, quantity: i.qty }))
      const { data } = await api.post('/shop/checkout', { items })
      window.location.href = data.checkout_url
    } catch (e) {
      setError(e.response?.data?.error || 'Afrekenen mislukt. Probeer het opnieuw.')
      setCheckingOut(false)
    }
  }

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  const visible = products.filter((p) => category === 'alle' || p.category === category)

  if (loading) return <div className="page loading-center"><div className="spinner" /></div>

  return (
    <div className="page">
      {/* Cart sidebar */}
      {cartOpen && (
        <CartSidebar
          cart={cart}
          onClose={() => setCartOpen(false)}
          onCheckout={handleCheckout}
          checkingOut={checkingOut}
        />
      )}

      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Bokswinkel</h1>
          <p>Officiële MHGym boksuitrusting en kleding</p>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => setCartOpen(true)}
          style={{ position: 'relative' }}
        >
          <ShoppingCart size={18} />
          Winkelwagen
          {cartCount > 0 && (
            <span className="cart-badge">{cartCount}</span>
          )}
        </button>
      </div>

      {error   && <div className="alert alert-error"   style={{ marginBottom: '1.5rem' }}><AlertCircle size={16} />{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>{success}</div>}

      {/* Category filter */}
      <div className="filter-bar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-btn${category === cat ? ' active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat === 'alle' ? (
              'Alle producten'
            ) : (
              <>{CATEGORY_EMOJI[cat]} {cat}</>
            )}
          </button>
        ))}
      </div>

      {/* Product grid */}
      {visible.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={48} opacity={0.3} /></div>
          <h3>Geen producten gevonden</h3>
          <p>Probeer een andere categorie.</p>
        </div>
      ) : (
        <div className="shop-grid">
          {visible.map((product) => {
            const inCart = cart.find((i) => i.id === product.id)
            const emoji  = CATEGORY_EMOJI[product.category] || '📦'
            const stockNum = Number(product.stock)
            const outOfStock = stockNum === 0
            const lowStock   = stockNum > 0 && stockNum <= 3

            return (
              <div key={product.id} className="product-card">
                <div className="product-image">{emoji}</div>

                <div>
                  <span className={`badge badge-${product.category}`} style={{ marginBottom: '0.5rem' }}>
                    {product.category}
                  </span>
                  <div className="product-name">{product.name}</div>
                  <div className="product-desc">{product.description}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div>
                    <div className="product-price">€{Number(product.price).toFixed(2).replace('.', ',')}</div>
                    {outOfStock ? (
                      <div className="product-stock out">Uitverkocht</div>
                    ) : lowStock ? (
                      <div className="product-stock low">Nog {product.stock} op voorraad</div>
                    ) : (
                      <div className="product-stock">Op voorraad</div>
                    )}
                  </div>
                </div>

                {inCart ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button className="cart-qty-btn" onClick={() => _setCart((prev) => {
                        const updated = prev.map((i) => i.id === product.id ? { ...i, qty: i.qty - 1 } : i)
                        return updated.filter((i) => i.qty > 0)
                      })}>
                        {inCart.qty === 1 ? <Trash2 size={12} /> : <Minus size={12} />}
                      </button>
                      <span style={{ fontWeight: 700, minWidth: '1.5rem', textAlign: 'center' }}>{inCart.qty}</span>
                      <button className="cart-qty-btn" onClick={() => addToCart(product)}><Plus size={12} /></button>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCartOpen(true)}>
                      Bekijk
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary btn-full"
                    disabled={outOfStock}
                    onClick={() => !outOfStock && addToCart(product)}
                  >
                    <ShoppingCart size={15} />
                    {outOfStock ? 'Uitverkocht' : 'In winkelwagen'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Trust strip */}
      <div style={{
        marginTop: '3rem', padding: '1.25rem 2rem',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {[
          { icon: '🔒', text: 'Veilig betalen via Mollie' },
          { icon: '🏪', text: 'Afhalen bij de balie' },
          { icon: '🥊', text: 'Officiële MHGym producten' },
          { icon: '✅', text: 'Direct beschikbaar na betaling' },
        ].map(({ icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>{icon}</span>{text}
          </div>
        ))}
      </div>
    </div>
  )
}
