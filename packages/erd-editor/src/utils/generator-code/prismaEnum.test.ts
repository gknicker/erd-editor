import { describe, expect, it } from 'vite-plus/test';

import {
  formatEnum,
  parseEnumComment,
  parseEnumType,
  toMembers,
} from '@/utils/generator-code/prismaEnum';

describe('generator-code/prismaEnum', () => {
  describe('parseEnumType', () => {
    it('reads the values of a MySQL ENUM', () => {
      expect(parseEnumType("ENUM('DRAFT','PAID')")).toEqual(['DRAFT', 'PAID']);
    });

    it('reads them in any case and spacing', () => {
      expect(parseEnumType(" enum ( 'a' , 'b' ) ")).toEqual(['a', 'b']);
    });

    it('reads a doubled quote inside a value', () => {
      expect(parseEnumType("ENUM('it''s','b,c')")).toEqual(["it's", 'b,c']);
    });

    it.each(['VARCHAR(10)', "SET('a')", 'ENUM()', 'text'])(
      'reads no values from %j',
      type => {
        expect(parseEnumType(type)).toBeNull();
      }
    );
  });

  describe('parseEnumComment', () => {
    it('reads the enum the importer writes as a whole comment', () => {
      expect(parseEnumComment('order_status: pending | paid')).toEqual({
        storedName: 'order_status',
        values: ['pending', 'paid'],
        rest: '',
      });
    });

    it('keeps what the comment said before the enum', () => {
      expect(parseEnumComment('Who they are Role: USER | ADMIN')).toEqual({
        storedName: 'Role',
        values: ['USER', 'ADMIN'],
        rest: 'Who they are',
      });
    });

    it('reads a single value', () => {
      expect(parseEnumComment('Kind: only')?.values).toEqual(['only']);
    });

    it.each([
      'no enum here',
      'Status: open or closed',
      'Role: USER | ADMIN, mostly',
      'Role:USER | ADMIN',
      '',
    ])('reads no enum from %j', comment => {
      expect(parseEnumComment(comment)).toBeNull();
    });
  });

  describe('toMembers', () => {
    it('names a member by the value it stores', () => {
      expect(toMembers(['DRAFT', 'paid'])).toEqual([
        { name: 'DRAFT', value: 'DRAFT' },
        { name: 'paid', value: 'paid' },
      ]);
    });

    it('makes an identifier of any other value', () => {
      expect(toMembers(['in-progress', '1st', 'a b', ''])).toEqual([
        { name: 'in_progress', value: 'in-progress' },
        { name: 'V1st', value: '1st' },
        { name: 'a_b', value: 'a b' },
        { name: 'V', value: '' },
      ]);
    });

    it('keeps two values that make one name apart', () => {
      expect(
        toMembers(['a-b', 'a b', 'a.b']).map(member => member.name)
      ).toEqual(['a_b', 'a_b_2', 'a_b_3']);
    });
  });

  describe('formatEnum', () => {
    it('writes a member per line', () => {
      expect(
        formatEnum({
          name: 'Role',
          dbName: '',
          members: toMembers(['USER', 'ADMIN']),
        })
      ).toEqual(['enum Role {', '  USER', '  ADMIN', '}']);
    });

    it('maps a member to the value it stores and the enum to its database name', () => {
      expect(
        formatEnum({
          name: 'Status',
          dbName: 'order_status',
          members: toMembers(['open', 'in-progress']),
        })
      ).toEqual([
        'enum Status {',
        '  open',
        '  in_progress @map("in-progress")',
        '',
        '  @@map("order_status")',
        '}',
      ]);
    });

    it('maps nothing where the database name is the enum name', () => {
      expect(
        formatEnum({ name: 'Role', dbName: 'Role', members: toMembers(['A']) })
      ).toEqual(['enum Role {', '  A', '}']);
    });
  });
});
