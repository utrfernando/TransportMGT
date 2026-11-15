import React from 'react';
import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { Button } from '../components/ui/Button';

const NotFound: React.FC = () => (
  <section className="max-w-xl mx-auto px-4 py-24 text-center">
    <div className="mx-auto w-20 h-20 rounded-full bg-mint-50 text-mint-500 flex items-center justify-center mb-5"><SearchX size={36} strokeWidth={1.5} /></div>
    <h1 className="font-display text-4xl font-extrabold text-ink-900">Page not found</h1>
    <p className="text-ink-500 mt-2">The page you are looking for does not exist or has moved.</p>
    <Link to="/"><Button className="mt-6" size="lg">Back to home</Button></Link>
  </section>
);

export default NotFound;
