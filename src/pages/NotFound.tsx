import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import VehicleArt from '../components/public/VehicleArt';

const NotFound: React.FC = () => (
  <section className="max-w-xl mx-auto px-4 py-24 text-center">
    <div className="mx-auto w-64 mb-6"><VehicleArt kind="bus" /></div>
    <p className="font-display text-6xl font-extrabold text-navy-800">404</p>
    <h1 className="font-display text-2xl font-extrabold text-navy-900 mt-2">This road doesn’t lead anywhere</h1>
    <p className="text-slate-600 mt-2">The page you are looking for does not exist or has moved.</p>
    <Link to="/"><Button className="mt-6" size="lg" variant="navy">Back to home</Button></Link>
  </section>
);

export default NotFound;
