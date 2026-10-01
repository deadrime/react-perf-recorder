import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// A page for the largest-contentful-paint tests, not listed on the site: ?case=late, lazy, text or blocked.

const photo = (ms: number) => `/__lcp/photo.svg?ms=${ms}&n=${Math.random().toString(36).slice(2)}`;

const Header = () => <p className="brand">Shop</p>;

const HeroImage = ({ src, lazy }: { src: string; lazy?: boolean }) => (
  <img className="hero" alt="" src={src} width={640} height={320} style={{ display: 'block' }} {...(lazy ? { loading: 'lazy' as const } : {})} />
);

/** The hero comes from data fetched in an effect: its image cannot be asked for before that commit. */
const Late = () => {
  const [hero, setHero] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setHero(photo(300)), 600);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <Header />
      {hero ? <HeroImage src={hero} /> : <div className="hero-skeleton" style={{ width: 640, height: 320 }} />}
    </>
  );
};

const lazySrc = photo(100);

const Lazy = () => (
  <>
    <Header />
    <HeroImage src={lazySrc} lazy />
  </>
);

const Headline = () => <h1 style={{ fontSize: 56, margin: 0 }}>Everything for the kitchen, delivered today</h1>;

const Text = () => (
  <>
    <Header />
    <Headline />
  </>
);

/** Work a render does for long: the paint of the image that already arrived waits for it. */
function slowSum(ms: number) {
  const until = performance.now() + ms;
  let n = 0;
  while (performance.now() < until) n++;
  return n;
}

const Recommendations = () => <p className="recs">{slowSum(400) > 0 ? 'Picked for you' : ''}</p>;

const blockedSrc = photo(100);

/** The image is asked for at once and comes in 100 ms, but a slow render holds the thread as it arrives. */
const Blocked = () => {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMore(true), 60);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <Header />
      <HeroImage src={blockedSrc} />
      {more && <Recommendations />}
    </>
  );
};

export function LcpPage() {
  const [params] = useSearchParams();
  const which = params.get('case') ?? 'late';
  return (
    <main style={{ padding: 16 }}>{which === 'lazy' ? <Lazy /> : which === 'text' ? <Text /> : which === 'blocked' ? <Blocked /> : <Late />}</main>
  );
}
