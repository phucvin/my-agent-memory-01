CXX = g++
CXXFLAGS = -std=c++14 -Wall -Wextra `pkg-config --cflags protobuf`
LDFLAGS = `pkg-config --libs protobuf` -lgtest -lgtest_main -lpthread
BENCH_LDFLAGS = `pkg-config --libs protobuf` -lpthread

TARGET = test_runner
BENCH_TARGET = benchmark_runner

SRCS = test_main.cpp
BENCH_SRCS = benchmark_main.cpp

all: $(TARGET) $(BENCH_TARGET)

$(TARGET): $(SRCS)
	$(CXX) $(CXXFLAGS) -o $@ $(SRCS) $(LDFLAGS)

$(BENCH_TARGET): $(BENCH_SRCS)
	$(CXX) $(CXXFLAGS) -o $@ $(BENCH_SRCS) $(BENCH_LDFLAGS)

clean:
	rm -f $(TARGET) $(BENCH_TARGET)
