import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../learning.css';

/** A soft end card for academy pages: points to the agency's services (no form, no pressure). */
export function WorkWithUsCard() {
  return (
    <aside className="lx-endcard" aria-label="Work with Optimize All">
      <p>
        <strong>Need this done for you?</strong>{' '}
        <Link to="/services" className="lx-endcard__link">
          Work with Optimize All <ArrowRight aria-hidden="true" className="lx-inline-icon" />
        </Link>
      </p>
    </aside>
  );
}
