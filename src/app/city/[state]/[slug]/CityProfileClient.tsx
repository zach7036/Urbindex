'use client';

import { useState, useEffect } from 'react';
import { CityProfile } from '@/lib/types';
import CityHeader from '@/components/city/CityHeader';
import DemographicsSection from '@/components/city/DemographicsSection';
import EconomySection from '@/components/city/EconomySection';
import HousingSection from '@/components/city/HousingSection';
import ClimateSection from '@/components/city/ClimateSection';
import SafetySection from '@/components/city/SafetySection';
import EducationSection from '@/components/city/EducationSection';
import LivabilitySection from '@/components/city/LivabilitySection';

const SECTIONS = [
  { id: 'demographics', label: 'Demographics' },
  { id: 'economy', label: 'Economy' },
  { id: 'housing', label: 'Housing' },
  { id: 'climate', label: 'Climate' },
  { id: 'safety', label: 'Safety' },
  { id: 'education', label: 'Education' },
  { id: 'livability', label: 'Livability' },
];

interface Props {
  profile: CityProfile;
}

export default function CityProfileClient({ profile }: Props) {
  const [activeSection, setActiveSection] = useState('demographics');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const headerOffset = 128;
      const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <div>
      <CityHeader profile={profile} />

      <nav className="section-nav">
        <div className="section-nav-inner">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              className={`section-nav-item ${activeSection === id ? 'active' : ''}`}
              onClick={() => scrollToSection(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main>
        <DemographicsSection data={profile.demographics} />
        <EconomySection data={profile.economy} />
        <HousingSection data={profile.housing} />
        <ClimateSection data={profile.climate} />
        <SafetySection data={profile.safety} />
        <EducationSection data={profile.education} />
        <LivabilitySection data={profile.livability} />
      </main>
    </div>
  );
}
