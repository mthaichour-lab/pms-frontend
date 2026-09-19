import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { externalRequestUrl } from '@/proxy';

describe('externalRequestUrl', () => {
  it('uses NEXTAUTH_URL instead of the container bind address', () => {
    process.env['NEXTAUTH_URL'] = 'http://localhost:3000';
    const request = new NextRequest('http://0.0.0.0:3000/customers?tab=active');

    expect(externalRequestUrl(request).href).toBe('http://localhost:3000/customers?tab=active');
  });
});
