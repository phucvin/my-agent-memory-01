#include <iostream>
#include <chrono>
#include <vector>
#include <string>
#include "generic_proto_manager.h"
#include <google/protobuf/message.h>
#include <google/protobuf/unknown_field_set.h>
#include <google/protobuf/empty.pb.h>

using namespace google::protobuf;

void BenchmarkMapSet(int iterations, int map_size) {
    Empty msg;
    int map_tag = 1;

    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < iterations; ++i) {
        GenericProtoManager::SetMapEntry(&msg, map_tag, i % map_size, (int64_t)i);
    }

    auto end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> diff = end - start;
    std::cout << "GenericProtoManager::SetMapEntry (" << iterations << " ops, map size " << map_size << "): "
              << diff.count() << " s (" << (iterations / diff.count()) << " ops/s)" << std::endl;
}

void BenchmarkMapGet(int iterations, int map_size) {
    Empty msg;
    int map_tag = 1;

    // Pre-populate
    for (int i = 0; i < map_size; ++i) {
        GenericProtoManager::SetMapEntry(&msg, map_tag, i, (int64_t)i*100);
    }

    auto start = std::chrono::high_resolution_clock::now();

    long long sum = 0;
    for (int i = 0; i < iterations; ++i) {
        sum += GenericProtoManager::GetMapEntry<int, int64_t>(msg, map_tag, i % map_size);
    }

    auto end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> diff = end - start;
    std::cout << "GenericProtoManager::GetMapEntry (" << iterations << " ops, map size " << map_size << "): "
              << diff.count() << " s (" << (iterations / diff.count()) << " ops/s) Checksum: " << sum << std::endl;
}

void BenchmarkFastMapSet(int iterations, int map_size) {
    Empty msg;
    int map_tag = 1;
    FastProtoManager mgr(&msg);

    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < iterations; ++i) {
        mgr.SetMapEntry(map_tag, i % map_size, (int64_t)i);
    }

    auto end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> diff = end - start;
    std::cout << "FastProtoManager::SetMapEntry (" << iterations << " ops, map size " << map_size << "): "
              << diff.count() << " s (" << (iterations / diff.count()) << " ops/s)" << std::endl;
}

void BenchmarkFastMapGet(int iterations, int map_size) {
    Empty msg;
    int map_tag = 1;

    // Pre-populate using Generic
    for (int i = 0; i < map_size; ++i) {
        GenericProtoManager::SetMapEntry(&msg, map_tag, i, (int64_t)i*100);
    }

    FastProtoManager mgr(&msg);
    // Force load of map (first access parses it)
    mgr.GetMapEntry<int, int64_t>(map_tag, 0);

    auto start = std::chrono::high_resolution_clock::now();

    long long sum = 0;
    for (int i = 0; i < iterations; ++i) {
        sum += mgr.GetMapEntry<int, int64_t>(map_tag, i % map_size);
    }

    auto end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> diff = end - start;
    std::cout << "FastProtoManager::GetMapEntry (" << iterations << " ops, map size " << map_size << "): "
              << diff.count() << " s (" << (iterations / diff.count()) << " ops/s) Checksum: " << sum << std::endl;
}

int main() {
    std::cout << "--- Baseline (GenericProtoManager) ---" << std::endl;
    BenchmarkMapSet(1000, 100);
    BenchmarkMapSet(1000, 1000);
    BenchmarkMapGet(10000, 100);
    BenchmarkMapGet(10000, 1000);

    std::cout << "\n--- Optimized (FastProtoManager) ---" << std::endl;
    BenchmarkFastMapSet(100000, 100);
    BenchmarkFastMapSet(100000, 1000);
    BenchmarkFastMapGet(100000, 100);
    BenchmarkFastMapGet(100000, 1000);

    return 0;
}
