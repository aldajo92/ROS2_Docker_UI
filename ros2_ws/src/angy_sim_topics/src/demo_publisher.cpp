// Minimal demo publisher: a single rclcpp::Node owning two publishers
// (`/demo/string_message` and `/demo/counter`) driven by one wall
// timer. Kept intentionally small so it can be used to verify
// `ros2 topic list` / `ros2 topic echo`.

#include <chrono>
#include <memory>
#include <string>

#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/int32.hpp"
#include "std_msgs/msg/string.hpp"

using namespace std::chrono_literals;

namespace angy_sim_topics
{

class DemoPublisher : public rclcpp::Node
{
public:
  DemoPublisher()
  : rclcpp::Node("demo_publisher"), counter_(0)
  {
    // Relative topic names so the launch file's `namespace` argument
    // takes effect: with no namespace they resolve to /demo/* (the
    // documented contract); with namespace=robot1 they become
    // /robot1/demo/*. Absolute names (leading '/') would bypass the
    // namespace entirely.
    //
    // QoS depth of 10 mirrors the rclcpp default for examples and is
    // plenty for low-rate demo data; pick something larger only if a
    // subscriber needs a deeper history buffer.
    string_publisher_ =
      this->create_publisher<std_msgs::msg::String>("demo/string_message", 10);
    counter_publisher_ =
      this->create_publisher<std_msgs::msg::Int32>("demo/counter", 10);

    // 1 Hz keeps the terminal output readable when running
    // `ros2 topic echo`. Adjust the period if you need a denser
    // stream for benchmarking.
    timer_ = this->create_wall_timer(
      1s, std::bind(&DemoPublisher::on_timer, this));

    RCLCPP_INFO(
      this->get_logger(),
      "demo_publisher up: publishing /demo/string_message and /demo/counter at 1 Hz");
  }

private:
  void on_timer()
  {
    std_msgs::msg::String string_msg;
    string_msg.data = "Hello from angy_sim_topics #" + std::to_string(counter_);

    std_msgs::msg::Int32 counter_msg;
    counter_msg.data = counter_;

    string_publisher_->publish(string_msg);
    counter_publisher_->publish(counter_msg);

    RCLCPP_INFO(
      this->get_logger(),
      "Published string='%s', counter=%d",
      string_msg.data.c_str(), counter_msg.data);

    ++counter_;
  }

  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr string_publisher_;
  rclcpp::Publisher<std_msgs::msg::Int32>::SharedPtr counter_publisher_;
  rclcpp::TimerBase::SharedPtr timer_;
  std::int32_t counter_;
};

}  // namespace angy_sim_topics

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<angy_sim_topics::DemoPublisher>());
  rclcpp::shutdown();
  return 0;
}
