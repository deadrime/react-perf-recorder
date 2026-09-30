import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// A page for the layout-shift tests, not listed on the site: ?case=late, image, sheet or slide.

const ROWS = Array.from({ length: 12 }, (_, i) => `Order #${1040 + i}`);

const OrderList = () => (
  <ul className="orders" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
    {ROWS.map((row) => (
      <li key={row} style={{ height: 32, borderBottom: '1px solid #ddd' }}>
        {row}
      </li>
    ))}
  </ul>
);

const PromoBanner = () => (
  <div className="promo" style={{ height: 120, background: '#fde68a' }}>
    Free delivery this week
  </div>
);

/** Content that arrives well after the click and pushes the list down: counted, and a commit moved it. */
const Late = () => {
  const [promo, setPromo] = useState(false);
  return (
    <>
      <button data-testid="load" onClick={() => setTimeout(() => setPromo(true), 700)}>
        Load offers
      </button>
      {promo && <PromoBanner />}
      <OrderList />
    </>
  );
};

const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#93c5fd"/></svg>'
)}`;

/** A photo with no size set: it takes no space until it loads, then pushes the list down. */
const ProductPhoto = () => <img className="photo" alt="" src={PHOTO} style={{ display: 'block' }} />;

const ImageCase = () => {
  const [shown, setShown] = useState(false);
  return (
    <>
      <button data-testid="photo" onClick={() => setTimeout(() => setShown(true), 700)}>
        Show product
      </button>
      {shown && <ProductPhoto />}
      <OrderList />
    </>
  );
};

/** Work a slower phone does several times longer: the sheet starts to open later there. */
function slowSum(n: number) {
  const values = Array.from({ length: n }, (_, i) => (i * 7919) % 1000);
  return values.sort((a, b) => a - b).reduce((sum, v) => sum + v, 0);
}

const OrderForm = ({ work }: { work: number }) => <p className="total">Total {slowSum(work)}</p>;

/** A bottom sheet that opens by writing its height every frame, as an animation library does. */
const Sheet = ({ work }: { work: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - started) / 200);
      if (ref.current) ref.current.style.height = `${Math.round(k * 320)}px`;
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      ref={ref}
      className="sheet"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 0, overflow: 'hidden', background: '#e5e7eb' }}
    >
      <OrderForm work={work} />
    </div>
  );
};

const SheetCase = ({ work }: { work: number }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="open" onClick={() => setOpen(true)}>
        Checkout
      </button>
      <OrderList />
      {open && <Sheet work={work} />}
    </>
  );
};

/** The same sheet slid in with a transform: it moves on the screen and shifts nothing. */
const SlideCase = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="slide" onClick={() => setOpen(true)}>
        Filters
      </button>
      <OrderList />
      <div
        className="drawer"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: 320,
          background: '#e5e7eb',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms linear',
        }}
      />
    </>
  );
};

export const ShiftsPage = () => {
  const [params] = useSearchParams();
  const which = params.get('case') ?? 'late';
  const work = Number(params.get('work') ?? 200_000);
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      {which === 'sheet' ? <SheetCase work={work} /> : which === 'slide' ? <SlideCase /> : which === 'image' ? <ImageCase /> : <Late />}
    </main>
  );
};
