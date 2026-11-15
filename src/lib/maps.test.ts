import { describe, expect, it } from 'vitest';
import { googleDirectionsLink, googleMapsLink, parseMapInput } from './maps';

describe('parseMapInput', () => {
  it('reads plain coordinates in the usual ways', () => {
    expect(parseMapInput('6.9271, 79.8612')).toEqual({ lat: 6.9271, lng: 79.8612 });
    expect(parseMapInput(' 6.9271 79.8612 ')).toEqual({ lat: 6.9271, lng: 79.8612 });
    expect(parseMapInput('6.927079;79.861244')).toEqual({ lat: 6.927079, lng: 79.861244 });
    expect(parseMapInput('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });
  it('reads the coordinates inside a pasted Google Maps address', () => {
    expect(parseMapInput('https://www.google.com/maps/place/Galle+Face/@6.9270786,79.8446,17z/data=!3m1!4b1')).toEqual({ lat: 6.927079, lng: 79.8446 });
    expect(parseMapInput('https://www.google.com/maps/place/X/data=!4m6!3d7.2906!4d80.6337')).toEqual({ lat: 7.2906, lng: 80.6337 });
    expect(parseMapInput('https://www.google.com/maps?q=6.0535,80.2210')).toEqual({ lat: 6.0535, lng: 80.221 });
    expect(parseMapInput('https://maps.google.com/?ll=6.9,79.9&z=15')).toEqual({ lat: 6.9, lng: 79.9 });
  });
  it('refuses things it cannot read or that are not real coordinates', () => {
    expect(parseMapInput('')).toBeNull();
    expect(parseMapInput('Main Junction')).toBeNull();
    expect(parseMapInput('https://maps.app.goo.gl/AbCdEf123')).toBeNull();   // short link: cannot be expanded in the browser
    expect(parseMapInput('95, 80')).toBeNull();                              // latitude out of range
    expect(parseMapInput('6.9, 200')).toBeNull();                            // longitude out of range
  });
  it('builds Google Maps links', () => {
    expect(googleMapsLink({ lat: 6.9271, lng: 79.8612 })).toBe('https://www.google.com/maps/search/?api=1&query=6.9271,79.8612');
    expect(googleDirectionsLink({ lat: 6.9271, lng: 79.8612 })).toBe('https://www.google.com/maps/dir/?api=1&destination=6.9271,79.8612');
  });
});
