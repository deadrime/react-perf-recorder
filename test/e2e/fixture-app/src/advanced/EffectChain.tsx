import { useEffect, useState } from 'react';
import { Case, createDriver, Panel, RenderCount, useRenderCount } from '../basics/Case';

const BROKEN = `
const Trip = ({ country }) => {
  const [cities, setCities] = useState([]);
  useEffect(() => setCities(CITIES[country]), [country]);        // ← render 2
  const [city, setCity] = useState('');
  useEffect(() => setCity(cities[0] ?? ''), [cities]);           // ← render 3
  const [forecast, setForecast] = useState('');
  useEffect(() => setForecast(forecastOf(city)), [city]);        // ← render 4
  …
};`;

const FIXED = `
const Trip = ({ country }) => {
  const cities = CITIES[country];                                // ← worked out while rendering
  const [picked, setPicked] = useState(null);
  const city = cities.includes(picked) ? picked : cities[0];
  const forecast = forecastOf(city);
  …
};`;

const CITIES: Record<string, string[]> = {
  Georgia: ['Tbilisi', 'Batumi', 'Kutaisi'],
  Portugal: ['Lisbon', 'Porto', 'Faro'],
  Japan: ['Tokyo', 'Osaka', 'Sapporo'],
};
const forecastOf = (city: string) => (city ? `${city}: ${12 + (city.length % 9)}°, ${city.length % 2 ? 'sun' : 'rain'}` : '…');

const country = createDriver('Georgia');

const Line = ({ what, value }: { what: string; value: string }) => (
  <li>
    <span className="label wide">{what}</span>
    <span className="grow">{value || '…'}</span>
    <RenderCount n={useRenderCount()} />
  </li>
);

/** Each step copies the one before it into state: a render and a commit for every link of the chain. */
const ChainedTrip = () => {
  const picked = country.use();
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => setCities(CITIES[picked]), [picked]);
  const [city, setCity] = useState('');
  useEffect(() => setCity(cities[0] ?? ''), [cities]);
  const [forecast, setForecast] = useState('');
  useEffect(() => setForecast(forecastOf(city)), [city]);
  return (
    <ul className="rows">
      <Line what="country" value={picked} />
      <Line what="city" value={city} />
      <Line what="weather" value={forecast} />
    </ul>
  );
};

/** Everything that follows from the country is worked out in the render that got it. */
const DerivedTrip = () => {
  const picked = country.use();
  const city = CITIES[picked][0];
  return (
    <ul className="rows">
      <Line what="country" value={picked} />
      <Line what="city" value={city} />
      <Line what="weather" value={forecastOf(city)} />
    </ul>
  );
};

const Countries = () => {
  const current = country.use();
  return (
    <>
      {Object.keys(CITIES).map((name) => (
        <button key={name} type="button" data-testid={`country-${name}`} disabled={name === current} onClick={() => country.set(name)}>
          {name}
        </button>
      ))}
    </>
  );
};

export const EffectChain = () => (
  <Case
    title="a chain of effects"
    what={
      <>
        Picking a country decides the cities, the first city, and its weather. On the left each of those is copied into state by an effect that waits
        for the one before it: one click, four renders and four commits, and for three frames the screen shows a country with the old country's city.
        On the right they are worked out in the render that got the country — one render, and never a wrong pair on the screen.
      </>
    }
  >
    <p className="bar">
      <Countries />
    </p>
    <div className="two">
      <Panel
        kind="broken"
        title="useEffect → setState, three times"
        says="The recorder says: four commits after the click, three of them caused by core:effect."
        code={BROKEN}
      >
        <ChainedTrip />
      </Panel>
      <Panel kind="fixed" title="worked out while rendering" says="The recorder says: one commit, from the click." code={FIXED}>
        <DerivedTrip />
      </Panel>
    </div>
  </Case>
);
