#include <gtest/gtest.h>
#include "generic_proto_manager.h"
#include <google/protobuf/message.h>
#include <google/protobuf/unknown_field_set.h>
#include <google/protobuf/empty.pb.h>

using namespace google::protobuf;

class GenericProtoManagerTest : public ::testing::Test {
protected:
    Empty msg;
};

TEST_F(GenericProtoManagerTest, SInt64_Access) {
    int tag = 100;
    int64_t value = -123456789012345;

    // Caller A writes
    GenericProtoManager::SetSInt64(&msg, tag, value);

    // Caller B reads
    int64_t read_value = GenericProtoManager::GetSInt64(msg, tag);
    EXPECT_EQ(value, read_value);

    // Verify data integrity in UFS
    const UnknownFieldSet& ufs = GenericProtoManager::GetUFS(msg);
    EXPECT_EQ(ufs.field_count(), 1);
    EXPECT_EQ(ufs.field(0).number(), tag);
    EXPECT_EQ(ufs.field(0).type(), UnknownField::TYPE_VARINT);
}

TEST_F(GenericProtoManagerTest, Oneof_Safety) {
    int tagA = 10;
    int tagB = 11;

    // Set field A
    GenericProtoManager::SetSInt64(&msg, tagA, 100);
    EXPECT_EQ(GenericProtoManager::GetSInt64(msg, tagA), 100);

    // Set field B, declaring A as sibling
    std::vector<int> siblings = {tagA};
    GenericProtoManager::SetFieldWithOneofSafety(&msg, tagB, (int64_t)200, siblings,
        [](Message* m, int t, int64_t v) {
            GenericProtoManager::SetSInt64(m, t, v);
        }
    );

    // Verify A is gone, B is present
    EXPECT_EQ(GenericProtoManager::GetSInt64(msg, tagA), 0); // Default 0
    EXPECT_EQ(GenericProtoManager::GetSInt64(msg, tagB), 200);

    const UnknownFieldSet& ufs = GenericProtoManager::GetUFS(msg);
    EXPECT_EQ(ufs.field_count(), 1);
    EXPECT_EQ(ufs.field(0).number(), tagB);
}

TEST_F(GenericProtoManagerTest, Map_Update) {
    int map_tag = 50;

    // Add entry: Key=1, Value=100. Explicitly use int64_t to match previous behavior/expectations
    GenericProtoManager::SetMapEntry(&msg, map_tag, (int64_t)1, (int64_t)100);

    // Add entry: Key=2, Value=200
    GenericProtoManager::SetMapEntry(&msg, map_tag, (int64_t)2, (int64_t)200);

    // Verify we have 2 entries
    const UnknownFieldSet& ufs = GenericProtoManager::GetUFS(msg);
    EXPECT_EQ(ufs.field_count(), 2);

    // Update Key=1 -> Value=150
    // This should detect Key=1 and replace it
    GenericProtoManager::SetMapEntry(&msg, map_tag, (int64_t)1, (int64_t)150);

    // Verify we still have 2 entries (old Key=1 deleted, new Key=1 added)
    EXPECT_EQ(ufs.field_count(), 2);

    // Manually verify contents
    bool found_key_1 = false;
    bool found_key_2 = false;

    for (int i = 0; i < ufs.field_count(); ++i) {
        if (ufs.field(i).number() != map_tag) continue;

        std::string bytes = ufs.field(i).length_delimited();
        io::ArrayInputStream input(bytes.data(), bytes.size());
        io::CodedInputStream coded_input(&input);

        uint32_t tag;
        int64_t key = 0;
        int64_t value = 0;

        while ((tag = coded_input.ReadTag()) != 0) {
            int field_num = internal::WireFormatLite::GetTagFieldNumber(tag);
            if (field_num == 1) {
                coded_input.ReadVarint64((uint64_t*)&key);
            } else if (field_num == 2) {
                coded_input.ReadVarint64((uint64_t*)&value);
            } else {
                internal::WireFormatLite::SkipField(&coded_input, tag);
            }
        }

        if (key == 1) {
            EXPECT_EQ(value, 150);
            found_key_1 = true;
        } else if (key == 2) {
            EXPECT_EQ(value, 200);
            found_key_2 = true;
        }
    }

    EXPECT_TRUE(found_key_1);
    EXPECT_TRUE(found_key_2);
}

TEST_F(GenericProtoManagerTest, PackedVarints) {
    int tag = 200;
    std::vector<uint64_t> values = {1, 2, 300, 4000, 50000};

    GenericProtoManager::SetPackedVarints(&msg, tag, values);

    std::vector<uint64_t> read_values = GenericProtoManager::GetPackedVarints(msg, tag);
    EXPECT_EQ(values, read_values);
}

TEST_F(GenericProtoManagerTest, NestedMessage) {
    int tag = 300;
    Empty nested;
    // Put some data into 'nested' via the manager
    GenericProtoManager::SetSInt64(&nested, 1, 42);

    // Serialize and store into main msg
    GenericProtoManager::SetNestedMessage(&msg, tag, nested);

    // Retrieve
    Empty read_nested = GenericProtoManager::GetNestedMessage<Empty>(msg, tag);
    EXPECT_EQ(GenericProtoManager::GetSInt64(read_nested, 1), 42);
}

TEST_F(GenericProtoManagerTest, Basic_Accessors) {
    int tag = 400;
    EXPECT_FALSE(GenericProtoManager::HasField(msg, tag));

    GenericProtoManager::SetBool(&msg, tag, true);
    EXPECT_TRUE(GenericProtoManager::HasField(msg, tag));
    EXPECT_TRUE(GenericProtoManager::GetBool(msg, tag));

    GenericProtoManager::ClearField(&msg, tag);
    EXPECT_FALSE(GenericProtoManager::HasField(msg, tag));
}

TEST_F(GenericProtoManagerTest, Varint_Types) {
    // Bool
    GenericProtoManager::SetBool(&msg, 500, true);
    EXPECT_EQ(GenericProtoManager::GetBool(msg, 500), true);

    // Int32
    int32_t i32 = -123;
    GenericProtoManager::SetInt32(&msg, 501, i32);
    EXPECT_EQ(GenericProtoManager::GetInt32(msg, 501), i32);

    // UInt32
    uint32_t u32 = 123456;
    GenericProtoManager::SetUInt32(&msg, 502, u32);
    EXPECT_EQ(GenericProtoManager::GetUInt32(msg, 502), u32);

    // Int64
    int64_t i64 = -1234567890123L;
    GenericProtoManager::SetInt64(&msg, 503, i64);
    EXPECT_EQ(GenericProtoManager::GetInt64(msg, 503), i64);

    // UInt64
    uint64_t u64 = 1234567890123456789UL;
    GenericProtoManager::SetUInt64(&msg, 504, u64);
    EXPECT_EQ(GenericProtoManager::GetUInt64(msg, 504), u64);

    // Enum
    int enum_val = 42;
    GenericProtoManager::SetEnum(&msg, 505, enum_val);
    EXPECT_EQ(GenericProtoManager::GetEnum(msg, 505), enum_val);
}

TEST_F(GenericProtoManagerTest, Fixed_Types) {
    // Float
    float f = 3.14159f;
    GenericProtoManager::SetFloat(&msg, 600, f);
    EXPECT_FLOAT_EQ(GenericProtoManager::GetFloat(msg, 600), f);

    // Double
    double d = 2.718281828;
    GenericProtoManager::SetDouble(&msg, 601, d);
    EXPECT_DOUBLE_EQ(GenericProtoManager::GetDouble(msg, 601), d);

    // Fixed32
    uint32_t f32 = 0xDEADBEEF;
    GenericProtoManager::SetFixed32(&msg, 602, f32);
    EXPECT_EQ(GenericProtoManager::GetFixed32(msg, 602), f32);

    // Fixed64
    uint64_t f64 = 0xDEADBEEFCAFEBABE;
    GenericProtoManager::SetFixed64(&msg, 603, f64);
    EXPECT_EQ(GenericProtoManager::GetFixed64(msg, 603), f64);

    // SFixed32
    int32_t sf32 = -123456;
    GenericProtoManager::SetSFixed32(&msg, 604, sf32);
    EXPECT_EQ(GenericProtoManager::GetSFixed32(msg, 604), sf32);

    // SFixed64
    int64_t sf64 = -1234567890123456;
    GenericProtoManager::SetSFixed64(&msg, 605, sf64);
    EXPECT_EQ(GenericProtoManager::GetSFixed64(msg, 605), sf64);
}

TEST_F(GenericProtoManagerTest, String_Bytes) {
    // String
    std::string s = "Hello World";
    GenericProtoManager::SetString(&msg, 700, s);
    EXPECT_EQ(GenericProtoManager::GetString(msg, 700), s);

    // Bytes
    std::string b = "\x00\x01\x02\xFF";
    GenericProtoManager::SetBytes(&msg, 701, b);
    EXPECT_EQ(GenericProtoManager::GetBytes(msg, 701), b);

    // Empty String
    GenericProtoManager::SetString(&msg, 702, "");
    EXPECT_EQ(GenericProtoManager::GetString(msg, 702), "");
    EXPECT_TRUE(GenericProtoManager::HasField(msg, 702));
}

TEST_F(GenericProtoManagerTest, Repeated_Varints) {
    int tag = 800;

    // Add multiple values
    GenericProtoManager::AddRepeatedInt32(&msg, tag, 10);
    GenericProtoManager::AddRepeatedInt32(&msg, tag, 20);
    GenericProtoManager::AddRepeatedInt32(&msg, tag, 30);

    EXPECT_EQ(GenericProtoManager::GetRepeatedCount(msg, tag), 3);

    std::vector<int32_t> values = GenericProtoManager::GetRepeatedInt32(msg, tag);
    ASSERT_EQ(values.size(), 3);
    EXPECT_EQ(values[0], 10);
    EXPECT_EQ(values[1], 20);
    EXPECT_EQ(values[2], 30);
}

TEST_F(GenericProtoManagerTest, Repeated_Fixed) {
    int tag = 801;

    GenericProtoManager::AddRepeatedFloat(&msg, tag, 1.1f);
    GenericProtoManager::AddRepeatedFloat(&msg, tag, 2.2f);

    std::vector<float> values = GenericProtoManager::GetRepeatedFloat(msg, tag);
    ASSERT_EQ(values.size(), 2);
    EXPECT_FLOAT_EQ(values[0], 1.1f);
    EXPECT_FLOAT_EQ(values[1], 2.2f);
}

TEST_F(GenericProtoManagerTest, Repeated_String) {
    int tag = 802;

    GenericProtoManager::AddRepeatedString(&msg, tag, "foo");
    GenericProtoManager::AddRepeatedString(&msg, tag, "bar");

    std::vector<std::string> values = GenericProtoManager::GetRepeatedString(msg, tag);
    ASSERT_EQ(values.size(), 2);
    EXPECT_EQ(values[0], "foo");
    EXPECT_EQ(values[1], "bar");
}

TEST_F(GenericProtoManagerTest, SInt32_Access) {
    int tag = 900;
    int32_t value = -12345;

    GenericProtoManager::SetSInt32(&msg, tag, value);
    EXPECT_EQ(GenericProtoManager::GetSInt32(msg, tag), value);
}

TEST_F(GenericProtoManagerTest, GenericMap_Int_Float) {
    int map_tag = 60;
    // Key: int32, Value: float
    GenericProtoManager::SetMapEntry(&msg, map_tag, 10, 1.5f);
    GenericProtoManager::SetMapEntry(&msg, map_tag, 20, 2.5f);

    EXPECT_FLOAT_EQ((GenericProtoManager::GetMapEntry<int32_t, float>(msg, map_tag, 10)), 1.5f);
    EXPECT_FLOAT_EQ((GenericProtoManager::GetMapEntry<int32_t, float>(msg, map_tag, 20)), 2.5f);
    EXPECT_FLOAT_EQ((GenericProtoManager::GetMapEntry<int32_t, float>(msg, map_tag, 30, -1.0f)), -1.0f); // Default

    // Test GetMap
    std::map<int32_t, float> m = GenericProtoManager::GetMap<int32_t, float>(msg, map_tag);
    EXPECT_EQ(m.size(), 2);
    EXPECT_FLOAT_EQ(m[10], 1.5f);
    EXPECT_FLOAT_EQ(m[20], 2.5f);
}

TEST_F(GenericProtoManagerTest, GenericMap_String_String) {
    int map_tag = 61;
    GenericProtoManager::SetMapEntry(&msg, map_tag, std::string("key1"), std::string("val1"));
    GenericProtoManager::SetMapEntry(&msg, map_tag, std::string("key2"), std::string("val2"));

    // Overwrite
    GenericProtoManager::SetMapEntry(&msg, map_tag, std::string("key1"), std::string("val1_updated"));

    EXPECT_EQ((GenericProtoManager::GetMapEntry<std::string, std::string>(msg, map_tag, "key1")), "val1_updated");
    EXPECT_EQ((GenericProtoManager::GetMapEntry<std::string, std::string>(msg, map_tag, "key2")), "val2");

    std::map<std::string, std::string> m = GenericProtoManager::GetMap<std::string, std::string>(msg, map_tag);
    EXPECT_EQ(m.size(), 2);
    EXPECT_EQ(m["key1"], "val1_updated");
    EXPECT_EQ(m["key2"], "val2");
}

TEST_F(GenericProtoManagerTest, GenericMap_Bool_UInt64) {
    int map_tag = 62;
    GenericProtoManager::SetMapEntry(&msg, map_tag, true, (uint64_t)999);
    GenericProtoManager::SetMapEntry(&msg, map_tag, false, (uint64_t)888);

    EXPECT_EQ((GenericProtoManager::GetMapEntry<bool, uint64_t>(msg, map_tag, true)), 999);
    EXPECT_EQ((GenericProtoManager::GetMapEntry<bool, uint64_t>(msg, map_tag, false)), 888);

    std::map<bool, uint64_t> m = GenericProtoManager::GetMap<bool, uint64_t>(msg, map_tag);
    EXPECT_EQ(m.size(), 2);
    EXPECT_EQ(m[true], 999);
    EXPECT_EQ(m[false], 888);
}

class FastProtoManagerTest : public ::testing::Test {
protected:
    Empty msg;
};

TEST_F(FastProtoManagerTest, Map_Update) {
    int map_tag = 50;
    {
        FastProtoManager mgr(&msg);
        mgr.SetMapEntry(map_tag, 1, 100);
        mgr.SetMapEntry(map_tag, 2, 200);

        EXPECT_EQ((mgr.GetMapEntry<int, int>(map_tag, 1)), 100);
        EXPECT_EQ((mgr.GetMapEntry<int, int>(map_tag, 2)), 200);
        EXPECT_EQ((mgr.GetMapEntry<int, int>(map_tag, 3, -1)), -1);

        // Update
        mgr.SetMapEntry(map_tag, 1, 150);
        EXPECT_EQ((mgr.GetMapEntry<int, int>(map_tag, 1)), 150);
    } // Destructor flushes to msg

    // Verify in msg using GenericProtoManager
    EXPECT_EQ((GenericProtoManager::GetMapEntry<int, int>(msg, map_tag, 1)), 150);
    EXPECT_EQ((GenericProtoManager::GetMapEntry<int, int>(msg, map_tag, 2)), 200);
}

TEST_F(FastProtoManagerTest, PreExistingData) {
    int map_tag = 60;
    GenericProtoManager::SetMapEntry(&msg, map_tag, 10, 1000);

    {
        FastProtoManager mgr(&msg);
        // Should lazy load
        EXPECT_EQ((mgr.GetMapEntry<int, int>(map_tag, 10)), 1000);

        // Modify
        mgr.SetMapEntry(map_tag, 10, 2000);
        mgr.SetMapEntry(map_tag, 20, 3000);
    }

    EXPECT_EQ((GenericProtoManager::GetMapEntry<int, int>(msg, map_tag, 10)), 2000);
    EXPECT_EQ((GenericProtoManager::GetMapEntry<int, int>(msg, map_tag, 20)), 3000);
}

TEST_F(FastProtoManagerTest, SInt64_Access) {
    int tag = 70;
    {
        FastProtoManager mgr(&msg);
        mgr.SetSInt64(tag, -555);
        EXPECT_EQ(mgr.GetSInt64(tag), -555);
    }
    EXPECT_EQ(GenericProtoManager::GetSInt64(msg, tag), -555);
}

TEST_F(FastProtoManagerTest, Mixed_Data_Preservation) {
    // Write unmanaged field via Generic
    int unmanaged_tag = 999;
    GenericProtoManager::SetString(&msg, unmanaged_tag, "keep me");

    int managed_tag = 888;

    {
        FastProtoManager mgr(&msg);
        mgr.SetSInt64(managed_tag, 123);
        // Flush happens
    }

    // Check managed
    EXPECT_EQ(GenericProtoManager::GetSInt64(msg, managed_tag), 123);
    // Check unmanaged
    EXPECT_EQ(GenericProtoManager::GetString(msg, unmanaged_tag), "keep me");
}

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
