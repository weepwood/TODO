"""Bounded V8 snapshot reader for synthetic task-object paths; no heap JSON expansion."""
import array
import collections
import json
import mmap
import re
import sys

MAX_BYTES = 128 * 1024 * 1024
NUMBERS = re.compile(rb'\d+')
STRING = re.compile(rb'"[^"\\]*(?:\\.[^"\\]*)*"')


def inspect(path, task_id, prefix):
    with open(path, 'rb') as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as raw:
        if len(raw) > MAX_BYTES:
            raise ValueError('snapshot exceeds external-file limit')

        def section(key):
            match = re.search(rb'\n"' + key.encode() + rb'"\s*:\s*\[', raw)
            if not match:
                raise ValueError('missing snapshot section: ' + key)
            return match

        node_section = section('nodes')
        header = json.loads(raw[:node_section.start()].rstrip().rstrip(b',') + b'}')['snapshot']
        meta = header['meta']
        nf, ef = len(meta['node_fields']), len(meta['edge_fields'])
        ni, ei = meta['node_fields'].index, meta['edge_fields'].index
        nt, et = meta['node_types'][ni('type')], meta['edge_types'][ei('type')]
        count = header['node_count']
        if count > 2_000_000 or header['edge_count'] > 10_000_000:
            raise ValueError('graph exceeds bounded index budget')

        def numeric(key, stride, fields, records):
            start = section(key).end()
            end = raw.find(b']', start)
            if end < 0:
                raise ValueError('unterminated numeric section')
            result = [array.array('I') for _ in fields]
            remainder = []
            total = 0
            while start < end:
                stop = min(start + 1024 * 1024, end)
                if stop < end:
                    stop = raw.rfind(b',', start, stop) + 1
                    if stop <= start:
                        raise ValueError('invalid number chunk')
                values = remainder + [int(x) for x in NUMBERS.findall(raw[start:stop])]
                whole = len(values) // stride * stride
                for dest, field in zip(result, fields):
                    dest.extend(values[field:whole:stride])
                total += whole // stride
                remainder = values[whole:]
                start = stop
            if remainder or total != records:
                raise ValueError('numeric section count mismatch: ' + key)
            return result

        types, names, edge_counts = numeric('nodes', nf, [ni('type'), ni('name'), ni('edge_count')], count)
        kinds, labels, targets = numeric('edges', ef, [ei('type'), ei('name_or_index'), ei('to_node')], header['edge_count'])
        offsets = array.array('I', [0])
        for n in edge_counts:
            offsets.append(offsets[-1] + n)
        if offsets[-1] != len(kinds):
            raise ValueError('edge index mismatch')
        del edge_counts

        starts, ends = array.array('I'), array.array('I')
        wanted = {json.dumps(k).encode(): k for k in ('id', 'title', 'notes', 'status', task_id)}
        lookup = collections.defaultdict(set)
        for match in STRING.finditer(raw, section('strings').end()):
            index = len(starts)
            starts.append(match.start())
            ends.append(match.end())
            # All relevant property labels and the synthetic task ID are ASCII.
            if match.end() - match.start() < 256:
                key = wanted.get(match.group())
                if key is not None:
                    lookup[key].add(index)

        def string(i):
            return json.loads(raw[starts[i]:ends[i]])

        prop, obj, weak = et.index('property'), nt.index('object'), et.index('weak')
        candidates = {}
        for i in range(count):
            if types[i] != obj:
                continue
            task_match = False
            title = None
            notes = status = False
            for j in range(offsets[i], offsets[i + 1]):
                if kinds[j] != prop:
                    continue
                label = labels[j]
                if label in lookup['id']:
                    task_match = names[targets[j] // nf] in lookup[task_id]
                elif label in lookup['title']:
                    title = names[targets[j] // nf]
                elif label in lookup['notes']:
                    notes = True
                elif label in lookup['status']:
                    status = True
            if task_match and notes and status and title is not None:
                value = string(title)
                if value.startswith(prefix):
                    candidates[i] = value

        parent = array.array('i', [-1]) * count
        via = array.array('i', [-1]) * count
        queue = array.array('I', [0])
        parent[0] = 0
        head = 0
        pending = set(candidates)
        while head < len(queue) and pending:
            node = queue[head]
            head += 1
            for j in range(offsets[node], offsets[node + 1]):
                if kinds[j] == weak:
                    continue
                to = targets[j] // nf
                if parent[to] >= 0:
                    continue
                parent[to], via[to] = node, j
                queue.append(to)
                pending.discard(to)

        results = []
        for node, title in candidates.items():
            chain = []
            at = node
            if parent[at] >= 0:
                while at != 0 and len(chain) < 80:
                    j = via[at]
                    kind = et[kinds[j]]
                    edge = str(labels[j]) if kind in ('element', 'hidden') else string(labels[j])
                    chain.append({'node': string(names[at])[:160], 'type': nt[types[at]], 'edge': edge[:160], 'kind': kind})
                    at = parent[at]
                chain.append({'node': string(names[at])[:160], 'type': nt[types[at]], 'edge': 'root' if at == 0 else 'truncated'})
                chain.reverse()
            results.append({'title': title, 'path': chain})
        return {'snapshotNodes': count, 'visitedNodes': len(queue), 'taskObjects': results,
                'method': 'Whole UI V8 snapshot, mmap/typed numeric indexes, shortest non-weak-edge paths; no dominator or retained-size claim'}


if __name__ == '__main__':
    print(json.dumps(inspect(*sys.argv[1:4]), ensure_ascii=False))
